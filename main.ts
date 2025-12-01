// main.ts
import { Application, Router } from "https://deno.land/x/oak@v12.6.1/mod.ts";
import { S3Client, GetObjectCommand } from "npm:@aws-sdk/client-s3";
import { getSignedUrl } from "npm:@aws-sdk/s3-request-presigner";

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

router.get("/watch/:video", async (ctx) => {
  try {
    const videoName = ctx.params.video; // .mp4 မပါလည်း ရပါတယ်
    // User က .mp4 ထည့်မခေါ်ရင် ကိုယ်က ဖြည့်ပေးမယ်
    const finalName = videoName.endsWith(".mp4") ? videoName : `${videoName}.mp4`;

    // ၃ နာရီခံတဲ့ Link တောင်းမယ်
    const command = new GetObjectCommand({
      Bucket: "lugyicar", // Bucket နာမည် အမှန်ထည့်ပါ
      Key: finalName,
    });

    const signedUrl = await getSignedUrl(r2, command, { expiresIn: 10800 });

    // M3U8 ဖိုင်အဖြစ် ဖန်တီးခြင်း
    // Player ကို "ဒါ M3U8 ပါ၊ အထဲမှာ ဗီဒီယိုရှိပါတယ်" လို့ ပြောမယ့်ကုဒ်
    const m3u8Content = `#EXTM3U
#EXT-X-VERSION:3
#EXT-X-TARGETDURATION:10800
#EXT-X-MEDIA-SEQUENCE:0
#EXT-X-PLAYLIST-TYPE:VOD
#EXTINF:10800.0,
${signedUrl}
#EXT-X-ENDLIST`;

    // Headers သတ်မှတ်ခြင်း (အရေးကြီးပါတယ်)
    ctx.response.headers.set("Content-Type", "application/vnd.apple.mpegurl");
    ctx.response.headers.set("Content-Disposition", `inline; filename="${videoName}.m3u8"`);

    ctx.response.body = m3u8Content;

  } catch (error) {
    console.error(error);
    ctx.response.status = 404;
    ctx.response.body = "Video not found or Error generating link.";
  }
});

app.use(router.routes());
app.use(router.allowedMethods());

await app.listen({ port: 8000 });
