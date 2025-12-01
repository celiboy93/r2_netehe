// main.ts (Using 307 Redirect - No Bandwidth)
import { Application, Router } from "https://deno.land/x/oak@v12.6.1/mod.ts";
import { S3Client, GetObjectCommand } from "npm:@aws-sdk/client-s3";
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

// ဒီနေရာမှာ လမ်းကြောင်းသတ်မှတ်ပါတယ်
// ဥပမာ: https://project.deno.dev/watch/batman
router.get("/watch/:videoName", async (ctx) => {
  try {
    let videoName = ctx.params.videoName;

    // .mp4 မပါရင် ထည့်ပေးမယ်
    if (!videoName.endsWith(".mp4")) {
      videoName += ".mp4";
    }

    const command = new GetObjectCommand({
      Bucket: "lugyicar", // ပုံးနာမည် အမှန်ထည့်ပါ
      Key: videoName,
    });

    // ၃ နာရီ (10800 seconds) ခံမယ့် Link တောင်းမယ်
    const signedUrl = await getSignedUrl(r2, command, { expiresIn: 10800 });

    // Redirect လုပ်ရာမှာ 307 ကုဒ်ကို သုံးပါမယ်
    ctx.response.status = 307;
    ctx.response.redirect(signedUrl);

  } catch (err) {
    console.error(err);
    ctx.response.status = 404;
    ctx.response.body = "Video not found or Error generating link";
  }
});

const app = new Application();
app.use(router.routes());
app.use(router.allowedMethods());

await app.listen({ port: 8000 });
