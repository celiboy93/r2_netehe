// main.ts
import { Application, Router } from "https://deno.land/x/oak@v12.6.1/mod.ts";
import { S3Client, GetObjectCommand, HeadObjectCommand } from "npm:@aws-sdk/client-s3";
import { getSignedUrl } from "npm:@aws-sdk/s3-request-presigner";

// R2 Setup
const r2 = new S3Client({
  region: "auto",
  endpoint: `https://${Deno.env.get("R2_ACCOUNT_ID")}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: Deno.env.get("R2_ACCESS_KEY_ID") || "",
    secretAccessKey: Deno.env.get("R2_SECRET_ACCESS_KEY") || "",
  },
});

const router = new Router();

// URL ပုံစံ: https://your-project.deno.dev/watch/batman.mp4
router.all("/watch/:filename", async (ctx) => {
  const filename = ctx.params.filename;
  // Bucket Name ကို ကိုယ့်နာမည်အမှန် ပြောင်းထည့်ပါ
  const bucketName = "lugyicar";

  try {
    // ၁။ APK က File Size လှမ်းစစ်တဲ့အချိန် (HEAD Request)
    // Redirect မလုပ်ဘဲ Size ကို Deno ကနေ တိုက်ရိုက်ပြန်ပြောမယ်
    if (ctx.request.method === "HEAD") {
      const command = new HeadObjectCommand({
        Bucket: bucketName,
        Key: filename,
      });

      // R2 ဆီကနေ ဖိုင်အချက်အလက် (Size) သွားယူတယ်
      const metadata = await r2.send(command);

      ctx.response.status = 200;
      ctx.response.headers.set("Content-Type", "video/mp4");
      ctx.response.headers.set("Content-Length", metadata.ContentLength?.toString() || "0");
      ctx.response.headers.set("Accept-Ranges", "bytes"); // Resume download ရအောင်
      return;
    }

    // ၂။ တကယ် Download ဆွဲတဲ့အချိန် (GET Request)
    // အချိန်ပိုင်း Link ထုတ်ပေးပြီး Redirect လုပ်မယ်
    const command = new GetObjectCommand({
      Bucket: bucketName,
      Key: filename,
      // ဒေါင်းတဲ့အခါ နာမည်အမှန်ပေါ်အောင် Force လုပ်ခြင်း
      ResponseContentDisposition: `attachment; filename="${filename}"`,
    });

    // ၁ နာရီ (3600 seconds) ခံတဲ့ Link
    const signedUrl = await getSignedUrl(r2, command, { expiresIn: 3600 });

    // APK နားလည်လွယ်တဲ့ 302 Redirect ကို သုံးပါမယ်
    ctx.response.status = 302;
    ctx.response.headers.set("Location", signedUrl);

  } catch (error) {
    console.error(error);
    ctx.response.status = 404;
    ctx.response.body = "Video not found or Error";
  }
});

const app = new Application();
app.use(router.routes());
app.use(router.allowedMethods());

console.log("Server is running...");
await app.listen({ port: 8000 });
