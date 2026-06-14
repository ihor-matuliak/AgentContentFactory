import { env } from "./env.js";

/**
 * Telegram-сповіщення власнику (необовʼязкове).
 *
 * Якщо TELEGRAM_BOT_TOKEN та TELEGRAM_OWNER_CHAT_ID не задані в .env —
 * функція тихо нічого не робить, тож рій працює і без Telegram.
 * Дізнатися свій chat_id: `npm run telegram:chat-id`.
 */
export async function notifyOwner(title: string, body = ""): Promise<void> {
  const { telegramBotToken: token, telegramOwnerChatId: chatId } = env;
  if (!token || !chatId) return;

  const text = body ? `*${title}*\n${body}` : `*${title}*`;
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: "Markdown",
        disable_web_page_preview: true,
      }),
    });
    if (!res.ok) {
      console.warn(`⚠️  Telegram-сповіщення не доставлено (HTTP ${res.status}).`);
    }
  } catch (err) {
    console.warn("⚠️  Не вдалося надіслати Telegram-сповіщення:", err);
  }
}
