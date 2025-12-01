import { Application, Router } from "https://deno.land/x/oak@v12.6.1/mod.ts";
import { S3Client, GetObjectCommand, HeadObjectCommand } from "npm:@aws-sdk/client-s3";
import { getSignedUrl } from "npm:@aws-sdk/s3-request-presigner";

// 🔥 LINK သက်တမ်း - ၁၂ နာရီ (43200 စက္ကန့်)
const LINK_DURATION = 10800;

const app = new Application();
const router = new Router();

// S3 Clients Cache
const clients = new Map<string, S3Client>();

function getR2Client(acc: string) {
  if (clients.has(acc)) return clients.get(acc)!;

  const suffix = acc === "1" ? "" : `_${acc}`;
  const accountId = Deno.env.get(`R2_ACCOUNT_ID${suffix}`) || Deno.env.get("R2_ACCOUNT_ID");
  const accessKeyId = Deno.env.get(`R2_ACCESS_KEY_ID${suffix}`) || Deno.env.get("R2_ACCESS_KEY_ID");
  const secretAccessKey = Deno.env.get(`R2_SECRET_ACCESS_KEY${suffix}`) || Deno.env.get("R2_SECRET_ACCESS_KEY");

  if (!accountId || !accessKeyId || !secretAccessKey) throw new Error(`Missing env vars for acc=${acc}`);

  const client = new S3Client({
    region: "auto",
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId, secretAccessKey },
  });

  clients.set(acc, client);
  return client;
}

// 🔥 ၁။ CORS နှင့် Headers ပြင်ဆင်ခြင်း (Seeking အတွက် အရေးကြီးသည်)
app.use(async (ctx, next) => {
  ctx.response.headers.set("Access-Control-Allow-Origin", "*");
  ctx.response.headers.set("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS");
  // Range ကို ထည့်ပေးမှ Player က ကျော်ကြည့်လို့ရမယ်
  ctx.response.headers.set("Access-Control-Allow-Headers", "Content-Type, Content-Length, Authorization, Range");
  ctx.response.headers.set("Access-Control-Expose-Headers", "Content-Length, Content-Range, Accept-Ranges");

  if (ctx.request.method === "OPTIONS") {
    ctx.response.status = 200;
    return;
  }
  await next();
});

router.get("/", handleRequest);
router.head("/", handleRequest);

async function handleRequest(ctx: any) {
  try {
    const video = ctx.request.url.searchParams.get("video");
    const acc = ctx.request.url.searchParams.get("acc") || "1";

    if (!video) {
      ctx.response.status = 400;
      ctx.response.body = "Missing video parameter";
      return;
    }

    const suffix = acc === "1" ? "" : `_${acc}`;
    const bucketName = Deno.env.get(`R2_BUCKET_NAME${suffix}`) || Deno.env.get("R2_BUCKET_NAME");

    if (!bucketName) {
      ctx.response.status = 500;
      return;
    }

    let r2;
    try {
      r2 = getR2Client(acc);
    } catch (e) {
      console.error(e);
      ctx.response.status = 500;
      return;
    }

    const objectKey = video;

    // 🔥 ၂။ HEAD Request (APK က Size နှင့် Seeking ရမရ လာစစ်သောနေရာ)
    if (ctx.request.method === "HEAD") {
      try {
        const headCommand = new HeadObjectCommand({ Bucket: bucketName, Key: objectKey });
        const headData = await r2.send(headCommand);

        ctx.response.status = 200;
        if (headData.ContentLength) ctx.response.headers.set("Content-Length", headData.ContentLength.toString());
        if (headData.ContentType) ctx.response.headers.set("Content-Type", headData.ContentType);
        
        // Seek လုပ်လို့ရကြောင်း APK ကို အသိပေးခြင်း
        ctx.response.headers.set("Accept-Ranges", "bytes");
        return;
      } catch (error) {
        ctx.response.status = 404;
        return;
      }
    }

    // 🔥 ၃။ GET Request (Download/Stream Link ထုတ်ပေးခြင်း)
    const filename = video.split('/').pop() || "video.mp4";
    const encodedFilename = encodeURIComponent(filename);

    const command = new GetObjectCommand({
      Bucket: bucketName,
      Key: objectKey,
      ResponseContentDisposition: `attachment; filename="${filename}"; filename*=UTF-8''${encodedFilename}`,
    });

    const signedUrl = await getSignedUrl(r2, command, { expiresIn: LINK_DURATION });

    ctx.response.status = 302;
    ctx.response.headers.set("Location", signedUrl);

  } catch (err) {
    console.error("Main Error:", err);
    ctx.response.status = 500;
  }
}

app.use(router.routes());
app.use(router.allowedMethods());

await app.listen({ port: 8000 });
