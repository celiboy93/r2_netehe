// main.ts
import { Application, Router } from "https://deno.land/x/oak@v12.6.1/mod.ts";
import { S3Client, GetObjectCommand } from "npm:@aws-sdk/client-s3";
import { getSignedUrl } from "npm:@aws-sdk/s3-request-presigner";

// R2 Setup (ကိုယ့် Key တွေသေချာထည့်ပါ)
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

router.get("/watch/:filename", async (ctx) => {
  const filename = ctx.params.filename;

  // ၁။ .m3u8 နဲ့လာရင် ဖယ်ထုတ်ပြီး .mp4 ပြောင်းမယ် (R2 မှာရှာဖို့)
  // ဥပမာ: movie.m3u8 လာရင် movie.mp4 ဖြစ်သွားမယ်
  const realVideoName = filename.replace(".m3u8", ".mp4"); // .mp4 မဟုတ်ရင် ဒီနေရာမှာ ကိုယ့်ဖိုင် type ကိုပြင်ပါ

  try {
    const command = new GetObjectCommand({
      Bucket: "lugyicar", // ကိုယ့် Bucket နာမည်အမှန် ဒီမှာထည့်ပါ
      Key: realVideoName,
    });

    // ၂။ ၃ နာရီခံတဲ့ Link ထုတ်မယ်
    const signedUrl = await getSignedUrl(r2, command, { expiresIn: 10800 });

    // ၃။ M3U8 Playlist ဖန်တီးပေးမယ်
    // ဒီနည်းက Redirect မလုပ်ဘဲ စာသားဖိုင်ပဲ ပို့ပေးတာပါ
    ctx.response.status = 200;
    ctx.response.headers.set("Content-Type", "application/vnd.apple.mpegurl");
    ctx.response.headers.set("Cache-Control", "no-cache");

    // M3U8 Content
    ctx.response.body = `#EXTM3U
#EXT-X-VERSION:3
#EXT-X-TARGETDURATION:10800
#EXTINF:-1,Video
${signedUrl}
#EXT-X-ENDLIST`;

  } catch (error) {
    console.error(error);
    ctx.response.status = 404;
    ctx.response.body = "Video Not Found on R2";
  }
});

app.use(router.routes());
app.use(router.allowedMethods());

console.log("Server running...");
await app.listen({ port: 8000 });
