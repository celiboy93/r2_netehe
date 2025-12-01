// main.ts
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

const app = new Application();
const router = new Router();

// အစမ်းကြည့်ရန် Home Page
router.get("/", (ctx) => {
  ctx.response.body = "Hello! Video Server is Running with Oak!";
});

// Video လမ်းကြောင်းသတ်မှတ်ခြင်း
router.get("/watch/:filename", async (ctx) => {
  const filename = ctx.params.filename;

  try {
    const command = new GetObjectCommand({
      Bucket: "lugyicar", // ဒီနေရာမှာ R2 Bucket နာမည်အမှန် ထည့်ပေးပါ
      Key: filename,
    });

    // ၃ နာရီ (10800 seconds) ခံမယ့် Link ထုတ်ခြင်း
    const signedUrl = await getSignedUrl(r2, command, { expiresIn: 10800 });

    // Video ရှိရာသို့ Redirect လုပ်ခြင်း
    ctx.response.redirect(signedUrl);

  } catch (error) {
    console.error(error);
    ctx.response.status = 500;
    ctx.response.body = "Error generating link";
  }
});

app.use(router.routes());
app.use(router.allowedMethods());

await app.listen({ port: 8000 });
