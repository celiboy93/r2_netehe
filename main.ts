import { Application, Router } from "https://deno.land/x/oak@v12.6.1/mod.ts";
import { S3Client, GetObjectCommand, HeadObjectCommand } from "npm:@aws-sdk/client-s3";
import { getSignedUrl } from "npm:@aws-sdk/s3-request-presigner";

const app = new Application();
const router = new Router();

// အကောင့်နံပါတ်အလိုက် Credential ထုတ်ပေးမည့် Function
function getR2Client(acc: string) {
  // ဥပမာ: acc=2 ဆိုရင် R2_ACCOUNT_ID_2 ကို ရှာမယ်။ မရှိရင် အလွတ် (Original) ကို ရှာမယ်။
  const suffix = acc === "1" ? "" : `_${acc}`;

  // Key များ ရှာဖွေခြင်း (Specific -> Fallback to Default)
  const accountId = Deno.env.get(`R2_ACCOUNT_ID${suffix}`) || Deno.env.get("R2_ACCOUNT_ID");
  const accessKeyId = Deno.env.get(`R2_ACCESS_KEY_ID${suffix}`) || Deno.env.get("R2_ACCESS_KEY_ID");
  const secretAccessKey = Deno.env.get(`R2_SECRET_ACCESS_KEY${suffix}`) || Deno.env.get("R2_SECRET_ACCESS_KEY");
  const bucketName = Deno.env.get(`R2_BUCKET_NAME${suffix}`) || Deno.env.get("R2_BUCKET_NAME") || "default-bucket";

  if (!accountId || !accessKeyId || !secretAccessKey) {
    throw new Error(`Account ${acc} အတွက် Setting များ မပြည့်စုံပါ`);
  }

  const client = new S3Client({
    region: "auto",
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId, secretAccessKey },
  });

  return { client, bucketName };
}

router.get("/", async (ctx) => {
  try {
    const video = ctx.request.url.searchParams.get("video");
    const acc = ctx.request.url.searchParams.get("acc") || "1"; // acc မပါရင် 1 ဟုယူမယ်

    if (!video) {
      ctx.response.status = 400;
      ctx.response.body = "Video parameter is missing!";
      return;
    }

    // ၁။ သက်ဆိုင်ရာ အကောင့် Client ကို ဖန်တီးခြင်း
    const { client, bucketName } = getR2Client(acc);

    // ၂။ ဖိုင်နာမည်သန့်သန့်ရအောင် ယူခြင်း (ဥပမာ: movies/batman.mp4 -> batman.mp4)
    const cleanFileName = video.split("/").pop();

    // ၃။ APK က File Size လှမ်းမေးရင် (HEAD Request) ဖြေပေးခြင်း
    // (Deno Oak မှာ GET method ထဲကနေ HEAD ကိုပါ auto handle လုပ်ပေးတတ်ပါတယ်၊
    // ဒါပေမယ့် သေချာအောင် ဒီလို စစ်ပေးတာ ပိုကောင်းပါတယ်)

    // Note: APK တချို့က HEAD နဲ့ မမေးဘဲ GET နဲ့ပဲ မေးပြီး Header စောင့်တာရှိလို့
    // Download အတွက် Presigned URL ထုတ်ပေးခြင်းကိုပဲ ဦးစားပေးလုပ်ပါမယ်။

    const command = new GetObjectCommand({
      Bucket: bucketName,
      Key: video,
      ResponseContentDisposition: `attachment; filename="${cleanFileName}"`, // Download box တက်အောင်
    });
    // ၄။ Signed URL ထုတ်ပေးခြင်း (၁ နာရီ ခံပါမည်)
    const signedUrl = await getSignedUrl(client, command, { expiresIn: 10800 });

    // ၅။ Redirect လုပ်ခြင်း (302 Found - APK များနှင့် အကိုက်ညီဆုံး)
    ctx.response.status = 302;
    ctx.response.headers.set("Location", signedUrl);

    // APK တွေ File Size မြင်အောင် Content-Disposition ကို ဒီအဆင့်မှာလည်း ထည့်ပေးလိုက်မယ်
    ctx.response.headers.set("Content-Disposition", `attachment; filename="${cleanFileName}"`);

  } catch (err) {
    console.error(err);
    ctx.response.status = 500;
    ctx.response.body = "Server Error or File Not Found";
  }
});

app.use(router.routes());
app.use(router.allowedMethods());

console.log("Deno R2 Proxy is running...");
await app.listen({ port: 8000 });
