// main.ts
import { Application, Router } from "https://deno.land/x/oak@v12.6.1/mod.ts";
import { S3Client, GetObjectCommand } from "npm:@aws-sdk/client-s3";
import { getSignedUrl } from "npm:@aws-sdk/s3-request-presigner";

// ၁။ Cloudflare R2 Setup (ဒါက အတူတူပါပဲ)
const r2 = new S3Client({
  region: "auto",
  endpoint: `https://${Deno.env.get("R2_ACCOUNT_ID")}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: Deno.env.get("R2_ACCESS_KEY_ID") || "",
    secretAccessKey: Deno.env.get("R2_SECRET_ACCESS_KEY") || "",
  },
});

// ၂။ Oak Application နှင့် Router ဖန်တီးခြင်း
const app = new Application();
const router = new Router();

router.get("/", async (ctx) => {
  // URL ကနေ video name ကို ဆွဲထုတ်မယ်
  const videoName = ctx.request.url.searchParams.get("video");

  if (!videoName) {
    ctx.response.status = 400;
    ctx.response.body = "Error: ?video=filename.mp4 ထည့်ပေးရန် လိုအပ်ပါသည်။";
    return;
  }

  try {
    const command = new GetObjectCommand({
      Bucket: "lugyicar", // ဒီနေရာမှာ ကိုယ့် Bucket နာမည် အမှန်ထည့်ပါ
      Key: videoName,
    });

    // ၃ နာရီ (10800 seconds) ခံမယ့် Link ထုတ်မယ်
    const signedUrl = await getSignedUrl(r2, command, { expiresIn: 10800 });

    // Oak ရဲ့ အားသာချက် - ဒီနေရာမှာ User ကို Video ဆီ တန်းပို့လိုက်မယ် (Redirect)
    ctx.response.redirect(signedUrl);

  } catch (err) {
    console.error(err);
    ctx.response.status = 500;
    ctx.response.body = "Internal Server Error";
  }
});

// ၃။ App ကို Run ခြင်း
app.use(router.routes());
app.use(router.allowedMethods());

await app.listen({ port: 8000 });
