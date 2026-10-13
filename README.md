# Telegram APK Guard

Cloudflare Workers Free + D1 uchun TypeScript bot. APK hujjatlarini fayl nomi va MIME metadata orqali aniqlaydi; faylni yuklab olmaydi. Bu antivirus emas.

```text
Telegram HTTPS webhook -> Worker (/webhook) -> D1 hodisa -> grammY API deleteMessage
                                              -> guruh ogohlantirishi
                                              -> owner/admin bildirishnomalari
                         cron (* * * * *) -> kechiktirilgan, cheklangan qayta urinishlar
```

Bot bir nechta guruhni `group_id` bilan ajratadi. `groups` jadvali so‘nggi huquq va moderatsiya holatini, `moderation_events` esa har guruh tarixini saqlaydi. `update_id` asosiy kalit bo‘lgani uchun bir webhook yangilanishi qayta kelsa, hodisa qayta yaratilmaydi. Tahrirlangan hujjat alohida `update_id` oladi va qayta tekshiriladi. Ogohlantirish va har bir shaxsiy bildirishnoma oldidan D1da `sending` holati saqlanadi. Telegram xabarni qabul qilgandan keyin D1 uzilsa, natija `unknown` bo‘lib qoladi va avtomatik qayta yuborilmaydi. Bu takroriy xabar xavfini kamaytiradi, ammo yetkazib berishni mutlaq kafolatlamaydi. `deleteMessage` takroriy urinishi ham noaniq natija berishi mumkin; 400 javobini o‘chirildi deb hisoblamaymiz. `delete_failed` holati `next_retry_at` mavjud bo‘lsa vaqtinchalik; yakuniy bildirishnomalar qayta urinishlar tugagach ketadi.

Bildirishnoma va `/logs` vaqti `Asia/Tashkent` (UTC+5) bo‘yicha ko‘rsatiladi; D1 hodisa vaqti UTCda saqlanadi. Bildirishnomadagi guruh nomi ommaviy username bo‘lsa guruhga, yopiq superguruhda esa bot yuborgan ogohlantirish xabariga bog‘lanadi. Yopiq guruh havolasini faqat guruh a’zolari ochishi mumkin; ogohlantirish yuborilmasa yoki oddiy guruhda mos havola bo‘lmasa, nom havolasiz qoladi. Yuboruvchining ismi ko‘rsatiladi: username bo‘lsa ommaviy profil havolasi, bo‘lmasa Telegram ID havolasi qo‘yiladi. ID havolasi ayrim foydalanuvchilarning maxfiylik sozlamalari sabab ochilmasligi mumkin.

## Talablar va o‘rnatish

Node.js 22.12+ yoki 24+ va npm (Vitest 5 talabi); Cloudflare hisob (Workers Free va D1); Telegram `@BotFather` boti. Bot tokenini BotFather beradi. Botni guruhga admin qilib qo‘shing va **Delete messages** huquqini bering. Admin botlar guruh xabarlarini oladi; privacy mode o‘chiq bo‘lishi shart emas, ammo Telegramdagi amaldagi bot sozlamalarini tekshiring. Guruh ID sini guruhda `/id` orqali oling. Shaxsiy ID ni botga `/id` yuborib oling.

PowerShell:

```powershell
cd .\outputs\apk-guard-bot
npm install
npx wrangler login
npx wrangler d1 create apk-guard-db
```

`d1 create` chiqishidagi haqiqiy `database_id` ni `wrangler.jsonc` dagi `REPLACE_WITH_D1_DATABASE_ID` o‘rniga qo‘ying. Bu ID maxfiy token emas. Keyin:

```powershell
npx wrangler d1 migrations apply apk-guard-db --local
Copy-Item .dev.vars.example .dev.vars
notepad .dev.vars
npm run typecheck
npm test
npm run dev
```

`.dev.vars` ichiga mahalliy sinov tokeni, tasodifiy `WEBHOOK_SECRET` va vergul bilan ajratilgan raqamli `OWNER_IDS` kiriting. Fayl Gitga kiritilmaydi. `wrangler dev` lokal D1 bilan ishlaydi; Telegram real webhook uchun ochiq HTTPS URL zarur, shuning uchun mahalliy testlar haqiqiy Telegramsiz bajariladi. `OWNER_IDS` bo‘sh bo‘lsa `/logs` hammaga rad etiladi va owner bildirishnomasi ketmaydi.

macOS/Linux buyruqlari: `cp .dev.vars.example .dev.vars`, so‘ng matn muharririda tahrir qiling; qolgan `npm`/`npx wrangler` buyruqlari bir xil.

## Deploy

PowerShell:

```powershell
npx wrangler d1 migrations apply apk-guard-db --remote
npx wrangler secret put BOT_TOKEN
npx wrangler secret put WEBHOOK_SECRET
npx wrangler secret put OWNER_IDS
npm run deploy
```

Har bir `secret put` so‘raganda qiymatni terminalga kiriting; buyruq satriga tokenni yozmang. `WEBHOOK_SECRET` 1–256 belgili, faqat `A-Z`, `a-z`, `0-9`, `_`, `-`; kriptografik tasodifiy qiymatni `node -e "console.log(require('node:crypto').randomBytes(32).toString('base64url'))"` bilan yarating va xavfsiz saqlang. `OWNER_IDS`: masalan `123456789,987654321`. Egalar oldin botga shaxsiy `/start` yuborishi kerak; Telegram bot foydalanuvchi bilan suhbatni o‘zi boshlay olmaydi.

Deploy chiqishidagi `https://telegram-apk-guard.<subdomain>.workers.dev` manzilidan foydalaning. Webhookni ro‘yxatdan o‘tkazish uchun secretlarni **faqat joriy shell jarayoniga** xavfsiz manbadan kiriting. PowerShell:

```powershell
$env:BOT_TOKEN = [System.Net.NetworkCredential]::new('', (Read-Host 'Bot token' -AsSecureString)).Password
$env:WEBHOOK_SECRET = [System.Net.NetworkCredential]::new('', (Read-Host 'Webhook secret' -AsSecureString)).Password
node scripts/set-webhook.mjs 'https://telegram-apk-guard.<subdomain>.workers.dev'
Remove-Item Env:BOT_TOKEN,Env:WEBHOOK_SECRET
```

macOS/Linux:

```sh
printf 'Bot token: '; stty -echo; IFS= read -r BOT_TOKEN; stty echo; printf '\n'
printf 'Webhook secret: '; stty -echo; IFS= read -r WEBHOOK_SECRET; stty echo; printf '\n'
export BOT_TOKEN WEBHOOK_SECRET
node scripts/set-webhook.mjs 'https://telegram-apk-guard.<subdomain>.workers.dev'
unset BOT_TOKEN WEBHOOK_SECRET
```

`<subdomain>` ni Cloudflare bergan haqiqiy qiymatga almashtiring. Skript `/webhook` yo‘lini qo‘shadi, `message`, `edited_message`, `my_chat_member` yangilanishlarini va maxfiy sarlavhani sozlaydi. `drop_pending_updates` ishlatilmaydi. Maxfiy sarlavha Telegram so‘rovini tekshirishning bir qatlami; tokenni himoyalash va endpointni cheklash ham zarur.

Keyin botni guruhga qo‘shing, admin va Delete messages huquqini bering; `/status` orqali tekshiring. Egalar botga `/start` yuboradi. Har bir guruh administratori shaxsiy chatda `/start`, keyin `/subscribe -100...` yuboradi. Bot `getChatMember` bilan adminligini tekshiradi va har hodisada yana tekshiradi. `/unsubscribe -100...` obunani o‘chiradi. `/logs` faqat `OWNER_IDS` dagi shaxslar uchun. `/help`, `/id`, `/status` boshqa foydalanuvchilarga ham ochiq.

## Sinov va amaliy tekshiruv

```powershell
npm run typecheck
npm test
npm run format:check
```

Haqiqiy Telegramda alohida test guruhi ochib, `game.apk`, `GAME.APK`, `archive.apk.zip`, MIME ma’lum bo‘lgan nomsiz hujjat va oddiy matn yuboring. O‘chirish natijasi, guruh ogohlantirishi, owner va obunachi xabarlari, boshqa guruhga xabar ketmasligi, admin huquqi olib qo‘yilgandan keyingi holat, tahrirlangan xabar, botni chiqarish va `/status` ni tekshiring. Telegram API va D1ni sun’iy uzib ko‘rish faqat test muhitida tavsiya etiladi. Real Telegram bilan sinov bu loyiha topshirig‘ida bajarilmagan.

## Diagnostika

`GET /health` faqat `ok` qaytaradi. Webhook ma’lumotini tokenni URLga chiqarmasdan oling:

```powershell
$env:BOT_TOKEN = [System.Net.NetworkCredential]::new('', (Read-Host 'Bot token' -AsSecureString)).Password
node scripts/webhook-info.mjs
Remove-Item Env:BOT_TOKEN
npx wrangler tail
```

`pending_update_count` yoki `last_error_message` o‘ssa, webhook URL, secret, D1 migratsiyasi, bot huquqlari va Workers/D1 kvotasini tekshiring. Noto‘g‘ri secret 403, boshqa metod 405, D1 yoki kutilmagan ishlov xatosi 503 qaytaradi; Telegram 2xx bo‘lmagan webhookni qayta yuboradi. Telegram 429 `retry_after` D1da saqlanadi va cron keyin urinadi. Cron 1 daqiqada bir marta ishlaydi, shu sababli qayta urinish darhol emas. `deleteMessage` uchun Telegramning 48 soat chegarasi bor. Huquq yetishmasa hodisa `delete_failed` bo‘ladi va ogohlantirish ochiq ko‘rsatadi.

Token almashganda BotFather orqali yangi token oling, `wrangler secret put BOT_TOKEN` bilan yangilang, deployni tekshiring va yangi token bilan `set-webhook.mjs` ni qayta bajaring. Secret almashganda Worker secretini va `setWebhook` secretini bir vaqtda yangilang. Kod yangilanganda `npm test`, `npm run typecheck`, zarur bo‘lsa yangi D1 migratsiyasi, so‘ng `npm run deploy`; pending yangilanishlarni tashlab yubormang.

## Cheklovlar va xavfsizlik

- Faqat hujjatning oxirgi `.apk` kengaytmasi yoki `application/vnd.android.package-archive` MIME turi dalil bo‘ladi. `archive.apk.zip` nomiga qarab bloklanmaydi. Har ikkala metadata yo‘q bo‘lsa `unknown`; xabar o‘chirilmaydi. Bunday noaniq oddiy xabarlar D1ga yozilmaydi, chunki barcha guruh hujjatlari uchun audit bepul kvotani tez tugatishi mumkin.
- `malware.apk` ni `image.jpg` deb qayta nomlash va MIMEni o‘zgartirish aniqlanmasligi mumkin. Fayl ichini tahlil qilish alohida modulga qo‘shilishi mumkin; bunda yuklab olish, hajm, ZIP tuzilishi, CPU vaqti va Telegram fayl API cheklovlari hisobga olinadi. Workers Free ichida to‘liq antivirus kafolatlanmaydi.
- HTML matnlar escape qilinadi; SQL parametrli querylar ishlatiladi. Token, secret va fayl tarkibi D1ga yozilmaydi. API xatosining faqat kodi saqlanadi. Tokenni log yoki Gitga joylamang.
- `sending` paytida uzilish bo‘lsa jo‘natma `unknown` deb belgilanadi va dublikat chiqmasligi uchun avtomatik qayta yuborilmaydi. `unknown` holatni D1 orqali tekshirish mumkin. Ogohlantirish yuborishga ruxsat Telegramning o‘zi bilan urinishda tasdiqlanadi.
- Bir hodisadagi barcha obunachilar bazaga navbatlanadi, lekin har webhook/cron ishida ko‘pi bilan 5 ta shaxsiy xabar jo‘natiladi. Cron bir ishda bitta hodisani oladi, shuning uchun juda katta navbat sekin tugaydi; bu Workers Free subrequest limitini saqlash uchun qo‘yilgan. Xabar yuborishning tarmoqdagi noaniq xatosi avtomatik takrorlanmaydi; aniq 429 esa ko‘pi bilan ikki marta qayta urinadi.
- Baza ishlamasa webhook 503 qaytaradi, Telegram keyinroq qayta yuboradi. Cloudflare Workers kunlik limiti yoki D1 kvotasi tugasa moderatsiya vaqtincha ishlamaydi. Hech qanday 100% uptime kafolati yo‘q.

## Bepul tarif (rasmiy hujjatlar, 2026-10-13)

| Xizmat           |                                                                                                                                Free limit | Ta’siri                                                                          |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------: | -------------------------------------------------------------------------------- |
| Workers          |                                                                 100 000 so‘rov/kun; 10 ms CPU/so‘rov; 50 subrequest/so‘rov; 128 MB xotira | Limit oshsa so‘rovlar xato beradi. Ko‘p adminli hodisalar cron bo‘lib ishlanadi. |
| D1               |                                                             5 mln qator o‘qish/kun; 100 000 qator yozish/kun; 500 MB/baza va 5 GB/account | Limit tugasa D1 querylar xato beradi. Indekslar yozish kvotasini ham ishlatadi.  |
| Telegram Bot API | Bot ochish va Bot API uchun alohida pullik server kerak emas; [FAQ](https://core.telegram.org/bots/faq) tezlik cheklovlarini tushuntiradi | 429 bo‘lsa `retry_after` ga amal qilinadi.                                       |

Cloudflare tarif va limitlari o‘zgarishi mumkin. Workers va D1ni Free plan sifatida tanlang; Paid planga o‘tsangiz hisoblanadigan xarajatlar paydo bo‘ladi. Rasmiy manbalar: [Workers limits](https://developers.cloudflare.com/workers/platform/limits/), [Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/), [D1 pricing](https://developers.cloudflare.com/d1/platform/pricing/), [D1 limits](https://developers.cloudflare.com/d1/platform/limits/), [Telegram Bot API](https://core.telegram.org/bots/api), [grammY Workers](https://grammy.dev/hosting/cloudflare-workers-nodejs).
