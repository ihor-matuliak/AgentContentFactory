import { env } from "../env.js";

/**
 * Допомагає дізнатися свій TELEGRAM_OWNER_CHAT_ID.
 *
 * Як користуватися:
 *   1) Створіть бота у @BotFather, вставте токен у .env (TELEGRAM_BOT_TOKEN).
 *   2) Напишіть боту будь-яке повідомлення в Telegram.
 *   3) Виконайте `npm run telegram:chat-id` — скрипт покаже ваш chat_id.
 *   4) Впишіть його у .env (TELEGRAM_OWNER_CHAT_ID).
 */
async function main(): Promise<void> {
  const token = env.telegramBotToken;
  if (!token) {
    console.error("❌ Спершу впишіть TELEGRAM_BOT_TOKEN у .env (отримати у @BotFather).");
    process.exit(1);
  }

  const res = await fetch(`https://api.telegram.org/bot${token}/getUpdates`);
  const data = (await res.json()) as {
    ok: boolean;
    result?: Array<{ message?: { chat?: { id: number; first_name?: string; username?: string } } }>;
  };

  if (!data.ok) {
    console.error("❌ Telegram повернув помилку. Перевірте правильність токена.");
    process.exit(1);
  }

  const chats = new Map<number, string>();
  for (const u of data.result ?? []) {
    const chat = u.message?.chat;
    if (chat) chats.set(chat.id, chat.username ?? chat.first_name ?? "");
  }

  if (chats.size === 0) {
    console.log(
      "ℹ️  Оновлень не знайдено. Напишіть боту будь-яке повідомлення в Telegram і запустіть знову.",
    );
    return;
  }

  console.log("Знайдені чати (впишіть потрібний id у TELEGRAM_OWNER_CHAT_ID):");
  for (const [id, name] of chats) {
    console.log(`  • chat_id=${id}${name ? `  (${name})` : ""}`);
  }
}

main().catch((err) => {
  console.error("Помилка:", err);
  process.exit(1);
});
