import { Application, Router } from "https://deno.land/x/oak@v12.6.1/mod.ts";
import { S3Client, GetObjectCommand, HeadObjectCommand } from "npm:@aws-sdk/client-s3";
import { getSignedUrl } from "npm:@aws-sdk/s3-request-presigner";

// 🔥 LINK သက်တမ်း (စက္ကန့်) - ၁၂ နာရီ
const LINK_DURATION = 10800;

const app = new Application();
const router = new Router();

// CORS ဖြေရှင်းခြင်း (APK များအတွက် အရေးကြီးသည်)
app.use(async (ctx, next) => {
  ctx.response.headers.set("Access-Control-Allow-Origin", "*");
  ctx.response.headers.set("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS");
  ctx.response.headers.set("Access-Control-Allow-Headers", "Content-Type, Content-Length");

  if (ctx.request.method === "OPTIONS") {
    ctx.response.status = 200;
    return;
  }
  await next();
});

router.get("/", handleRequest);
router.head("/", handleRequest); // HEAD Request ကိုပါ လက်ခံမည်

async function handleRequest(ctx: any) {
  try {
    // ၁။ URL မှ video နှင့် acc နံပါတ်ကို ယူမည်
    const video = ctx.request.url.searchParams.get("video");
    const acc = ctx.request.url.searchParams.get("acc") || "1";

    if (!video) {
      ctx.response.status = 400;
      ctx.response.body = "Missing video parameter";
      return;
    }

    // ၂။ Account ခွဲထုတ်ခြင်း Logic
    const suffix = acc === "1" ? "" : `_${acc}`;

    const accountId = Deno.env.get(`R2_ACCOUNT_ID${suffix}`) || Deno.env.get("R2_ACCOUNT_ID");
    const accessKeyId = Deno.env.get(`R2_ACCESS_KEY_ID${suffix}`) || Deno.env.get("R2_ACCESS_KEY_ID");
    const secretAccessKey = Deno.env.get(`R2_SECRET_ACCESS_KEY${suffix}`) || Deno.env.get("R2_SECRET_ACCESS_KEY");

    // Bucket နာမည်တူတူပဲဆိုရင် တစ်နေရာတည်းက ယူမယ် (သို့) အကောင့်အလိုက်ခွဲချင်ရင်လည်းရ
    const bucketName = Deno.env.get(`R2_BUCKET_NAME${suffix}`) || Deno.env.get("R2_BUCKET_NAME");

    if (!accountId || !accessKeyId || !secretAccessKey || !bucketName) {
      console.error(`Missing env vars for acc=${acc}`);
      ctx.response.status = 500;
      ctx.response.body = "Server Configuration Error (Env Vars)";
      return;
    }
// ၃။ R2 Client တည်ဆောက်ခြင်း
    const r2 = new S3Client({
      region: "auto",
      endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
      credentials: { accessKeyId, secretAccessKey },
    });

    // ဖိုင်နာမည်ကို သန့်ရှင်းရေးလုပ်ခြင်း (Optional)
    // ဥပမာ movies/batman.mp4 လာရင် movies/batman.mp4 အတိုင်းထားမယ်
    const objectKey = video;

    // ၄။ APK က Size လာမေးရင် (HEAD Request)
    if (ctx.request.method === "HEAD") {
      try {
        // R2 ကို ဖိုင်ရှိမရှိနှင့် Size လှမ်းမေး
        const headCommand = new HeadObjectCommand({
          Bucket: bucketName,
          Key: objectKey,
        });
        const headData = await r2.send(headCommand);

        // APK ကို Size ပြန်ဖြေ (Redirect မလုပ်ပါ)
        ctx.response.status = 200;
        if (headData.ContentLength) {
            ctx.response.headers.set("Content-Length", headData.ContentLength.toString());
        }
        if (headData.ContentType) {
            ctx.response.headers.set("Content-Type", headData.ContentType);
        }
        ctx.response.headers.set("Accept-Ranges", "bytes"); // Resume download ရအောင်
        return;

      } catch (error) {
        console.error("HEAD Error:", error);
        ctx.response.status = 404; // ဖိုင်မရှိရင် 404 ပြ
        return;
      }
    }

    // ၅။ ဒေါင်းလုပ်ဆွဲရင် (GET Request) -> Link ထုတ်ပေးပြီး Redirect လုပ်
    const command = new GetObjectCommand({
      Bucket: bucketName,
      Key: objectKey,
      ResponseContentDisposition: `attachment; filename="${video.split('/').pop()}"`, // Force Download
    });

    const signedUrl = await getSignedUrl(r2, command, { expiresIn: LINK_DURATION });

    // APK ကို Link ပေးလိုက်ပါ (302 Redirect)
    ctx.response.status = 302;
    ctx.response.headers.set("Location", signedUrl);

  } catch (err) {
    console.error("Main Error:", err);
    ctx.response.status = 500;
    ctx.response.body = "Internal Server Error";
  }
}

app.use(router.routes());
app.use(router.allowedMethods());

await app.listen({ port: 8000 });
