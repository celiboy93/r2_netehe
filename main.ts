// main.ts
import { S3Client, GetObjectCommand } from "npm:@aws-sdk/client-s3";
import { getSignedUrl } from "npm:@aws-sdk/s3-request-presigner";

// ၁။ Cloudflare R2 နှင့် ချိတ်ဆက်ခြင်း (Setup)
const r2 = new S3Client({
  region: "auto",
  endpoint: `https://${Deno.env.get("R2_ACCOUNT_ID")}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: Deno.env.get("R2_ACCESS_KEY_ID") || "",
    secretAccessKey: Deno.env.get("R2_SECRET_ACCESS_KEY") || "",
  },
});

Deno.serve(async (req: Request) => {
  // ၂။ URL ထဲမှ video parameter ကို ရှာခြင်း
  const url = new URL(req.url);
  const videoName = url.searchParams.get("video");

  // ဗီဒီယိုနာမည် မပါလာရင် Error ပြမယ်
  if (!videoName) {
    return new Response("အသုံးပြုပုံ - /?video=filename.mp4 ဟု ရိုက်ထည့်ပေးပါ", { status: 400 });
  }

  try {
    // ၃။ R2 ပေါ်မှ ဖိုင်ကို လှမ်းယူရန် အမိန့် (Command) တည်ဆောက်ခြင်း
    const command = new GetObjectCommand({
      Bucket: Deno.env.get("R2_BUCKET_NAME"), // Environment Variable ထဲတွင် Bucket နာမည်ထည့်ထားရပါမယ်
      Key: videoName,
    });

    // ၄။ ၃ နာရီ (၁၀၈၀၀ စက္ကန့်) ခံမယ့် Link ကို ထုတ်ယူခြင်း
    const signedUrl = await getSignedUrl(r2, command, { expiresIn: 10800 });

    // ၅။ အသုံးပြုသူကို ထို Link သို့ လမ်းကြောင်းလွှဲပေးခြင်း (Redirect)
    return Response.redirect(signedUrl);

  } catch (error) {
    // တခုခုမှားယွင်းခဲ့လျှင်
    return new Response(`Error: ${error.message}`, { status: 500 });
  }
});
