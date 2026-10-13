const token = process.env.BOT_TOKEN;
if (!token) {
  console.error("BOT_TOKEN talab qilinadi.");
  process.exit(1);
}
try {
  const response = await fetch(
    `https://api.telegram.org/bot${token}/getWebhookInfo`,
  );
  const data = await response.json();
  if (!response.ok || data.ok !== true)
    throw new Error(`Telegram HTTP ${response.status}`);
  const { url, pending_update_count, last_error_date, last_error_message } =
    data.result;
  console.log(
    JSON.stringify(
      { url, pending_update_count, last_error_date, last_error_message },
      null,
      2,
    ),
  );
} catch (error) {
  console.error(
    error instanceof Error ? error.message : "Webhook tekshiruvi xatosi",
  );
  process.exit(1);
}
