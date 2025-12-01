// main.ts
import { Application, Router } from "https://deno.land/x/oak@v12.6.1/mod.ts";
import { S3Client, GetObjectCommand } from "npm:@aws-sdk/client-s3";
import { getSignedUrl } from "npm:@aws-sdk/s3-request-presigner";

// R2 Setup (ဒါက ပုံမှန်အတိုင်းပါပဲ)
const r2 = new S3Client({
  region: "auto",
  endpoint: `https://${Deno.env.get("R2_ACCOUNT_ID")}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: Deno.env.get("R2_ACCESS_KEY_ID") || "",
    secretAccessKey: Deno.env.get("R2_SECRET_ACCESS_KEY") || "",
  },
});

const app = new Application();
const router = new Router();

// URL ပုံစံက /watch/video_name.m3u8 ဖြစ်ပါမယ်
router.get("/watch/:filename", async (ctx) => {
  try {
    // ၁။ ဖိုင်နာမည်ကို ယူမယ် (.m3u8 ပါနေရင် ဖယ်မယ်)
    let filename = ctx.params.filename;
    if (filename.endsWith(".m3u8")) {
      filename = filename.replace(".m3u8", ".mp4"); // R2 ထဲမှာ .mp4 နဲ့ သိမ်းထားရင်ပေါ့
    } else if (!filename.endsWith(".mp4")) {
       filename = filename + ".mp4";
    }

    // ၂။ R2 ဆီမှာ ၃ နာရီခံတဲ့ Link သွားတောင်းမယ်
    const command = new GetObjectCommand({
      Bucket: "lugyicar", // Bucket နာမည် ပြောင်းထည့်ပါ
      Key: filename,
    });
    const signedUrl = await getSignedUrl(r2, command, { expiresIn: 10800 });

    // ၃။ M3U8 Format အနေနဲ့ ပြန်ထုတ်ပေးမယ်
    // Redirect မလုပ်ဘဲ စာသားဖိုင်အနေနဲ့ ပြန်ပို့တာပါ
    ctx.response.status = 200;
    ctx.response.headers.set("Content-Type", "application/vnd.apple.mpegurl");

    // M3U8 အထဲက အကြောင်းအရာ
    ctx.response.body = `#EXTM3U
#EXT-X-VERSION:3
#EXT-X-TARGETDURATION:10800
#EXTINF:10800,
${signedUrl}`;

  } catch (error) {
    console.error(error);
    ctx.response.status = 404;
    ctx.response.body = "Video not found";
  }
});

app.use(router.routes());
app.use(router.allowedMethods());

await app.listen({ port: 8000 });
