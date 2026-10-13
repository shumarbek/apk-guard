const token = process.env.BOT_TOKEN;
const secret = process.env.WEBHOOK_SECRET;
const base = process.argv[2];
if (!token || !secret || !base) {
  console.error(
    "BOT_TOKEN, WEBHOOK_SECRET va Worker HTTPS manzili talab qilinadi.",
  );
  process.exit(1);
}
if (!/^[A-Za-z0-9_-]{1,256}$/.test(secret)) {
  console.error(
    "WEBHOOK_SECRET faqat harf, raqam, _ va - dan iborat bo‘lsin (1–256 belgi).",
  );
  process.exit(1);
}
let url;
try {
  url = new URL(base);
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  )
    throw new Error();
  url.pathname = "/webhook";
} catch {
  console.error("To‘g‘ri HTTPS Worker manzilini kiriting.");
  process.exit(1);
}
try {
  const response = await fetch(
    `https://api.telegram.org/bot${token}/setWebhook`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        url: url.toString(),
        secret_token: secret,
        allowed_updates: ["message", "edited_message", "my_chat_member"],
        max_connections: 10,
      }),
    },
  );
  const data = await response.json();
  if (!response.ok || data.ok !== true || data.result !== true)
    throw new Error(
      `Telegram HTTP ${response.status}, API kodi ${data.error_code ?? "noma’lum"}`,
    );
  console.log(`Webhook o‘rnatildi: ${url.toString()}`);
} catch (error) {
  console.error(
    "Webhook xatosi:",
    error instanceof Error ? error.message : "noma’lum xato",
  );
  process.exit(1);
}
