import { Application, Router } from "https://deno.land/x/oak@v12.6.1/mod.ts";
import { S3Client, GetObjectCommand, HeadObjectCommand } from "npm:@aws-sdk/client-s3";
import { getSignedUrl } from "npm:@aws-sdk/s3-request-presigner";

// 🔥 LINK သက်တမ်း (စက္ကန့်) - လက်ရှိ: ၁၂ နာရီ
const LINK_DURATION = 43200;

const app = new Application();
const router = new Router();

// အကောင့်နံပါတ်အလိုက် Credential ထုတ်ပေးမည့် Function
function getR2Client(acc: string) {
  const suffix = acc === "1" ? "" : `_${acc}`;

  const accountId = Deno.env.get(`R2_ACCOUNT_ID${suffix}`);
  const accessKeyId = Deno.env.get(`R2_ACCESS_KEY_ID${suffix}`);
  const secretAccessKey = Deno.env.get(`R2_SECRET_ACCESS_KEY${suffix}`);

  if (!accountId || !accessKeyId || !secretAccessKey) {
    return null; // Key မရှိရင် null ပြန်မယ်
  }

  return new S3Client({
    region: "auto",
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId, secretAccessKey },
  });
}

router.get("/", async (ctx) => {
  const video = ctx.request.url.searchParams.get("video");
  const acc = ctx.request.url.searchParams.get("acc") || "1";

  if (!video) {
    ctx.response.status = 400;
    ctx.response.body = "Video parameter is missing!";
    return;
  }

  try {
    const r2 = getR2Client(acc);
    if (!r2) {
      ctx.response.status = 500;
      ctx.response.body = `Error: Keys for Account ${acc} not found!`;
      return;
    }

    // 🔥 APK များအတွက် HEAD Request (File Size စစ်ခြင်း) ကို လက်ခံဖြေကြားပေးခြင်း
    if (ctx.request.method === "HEAD") {
      try {
        const headCommand = new HeadObjectCommand({
          Bucket: Deno.env.get("BUCKET_NAME") || "YOUR_BUCKET_NAME",
          Key: video,
        });
        const headData = await r2.send(headCommand);

        ctx.response.status = 200;
        ctx.response.headers.set("Content-Type", headData.ContentType || "video/mp4");
        ctx.response.headers.set("Content-Length", String(headData.ContentLength));
        ctx.response.headers.set("Accept-Ranges", "bytes");
        return;
      } catch (error) {
        console.log("HEAD Error:", error);
        // HEAD မအောင်မြင်ရင်လည်း အောက်က GET ကို ဆက်သွားခွင့်ပြုမယ် (Fail safe)
      }
    }

    // 🔥 Download Link ထုတ်ပေးခြင်း
    const command = new GetObjectCommand({
      Bucket: Deno.env.get("BUCKET_NAME") || "YOUR_BUCKET_NAME",
      Key: video,
    });

    const signedUrl = await getSignedUrl(r2, command, { expiresIn: LINK_DURATION });

    // ✅ CACHING ထည့်သွင်းခြင်း
    // Browser/APK ကို "ဒီ Link က ၁ နာရီ (3600 စက္ကန့်) အတွင်း ဘာမှမပြောင်းဘူး၊ မှတ်ထားလိုက်" လို့ ပြောခြင်း
    ctx.response.headers.set("Cache-Control", "public, max-age=3600");

    ctx.response.status = 302;
    ctx.response.headers.set("Location", signedUrl);

  } catch (error) {
    console.error("Error generating signed URL:", error);
    ctx.response.status = 500;
    ctx.response.body = "Internal Server Error: " + error.message;
  }
});

app.use(router.routes());
app.use(router.allowedMethods());

await app.listen({ port: 8000 });
