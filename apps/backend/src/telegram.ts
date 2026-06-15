import { env } from "./env.js";
import { chatWithAgent, findAgentBySlug } from "./chat.js";
import { createRun } from "./store.js";
import { createIdea } from "./ideas.js";
import { addEvent, logActivity } from "./journal.js";
import { kickQueue } from "./agents/queue.js";
import { getProfile } from "./profile.js";
import { getDraftBody, getPlanItem, updatePlanItem } from "./content.js";
import {
  defaultProjectId,
  getProjectById,
  getProjectBySlug,
} from "./projects.js";

/**
 * Двосторонній Telegram (Фаза 5).
 *
 * Long-polling приймає повідомлення власника й маршрутизує:
 *   (звичайний текст)   → Стратег активного проєкту;
 *   /agent <slug> <txt> → конкретний агент;
 *   /task <txt>         → новий прогін рою (планування Стратегом);
 *   /idea <txt>         → інбокс ідей;
 *   /project <slug>     → перемикання активного проєкту.
 *
 * Публікація в канал — publishPlanItemToTelegram() (chat_id каналу у профілі).
 * Без TELEGRAM_BOT_TOKEN модуль тихо не запускається.
 */

const API = (method: string) =>
  `https://api.telegram.org/bot${env.telegramBotToken}/${method}`;

/** Активний проєкт для Telegram (перемикається командою /project). */
let activeProjectId: number | null = null;
let polling = false;

async function send(chatId: string | number, text: string): Promise<void> {
  try {
    await fetch(API("sendMessage"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: "Markdown",
        disable_web_page_preview: true,
      }),
    });
  } catch (err) {
    console.warn("⚠️  Telegram send не вдалося:", err);
  }
}

async function ensureActiveProject(): Promise<number | null> {
  if (activeProjectId && (await getProjectById(activeProjectId))) return activeProjectId;
  activeProjectId = await defaultProjectId();
  return activeProjectId;
}

/** Обробка одного текстового повідомлення власника. */
async function handleMessage(text: string): Promise<void> {
  const owner = env.telegramOwnerChatId;
  const trimmed = text.trim();
  if (!trimmed) return;

  const projectId = await ensureActiveProject();
  if (!projectId) {
    await send(owner, "Немає жодного проєкту. Створи проєкт у дашборді.");
    return;
  }

  // /project <slug>
  if (/^\/project\b/i.test(trimmed)) {
    const slug = trimmed.replace(/^\/project\b/i, "").trim();
    if (!slug) {
      const cur = await getProjectById(projectId);
      await send(owner, `Активний проєкт: *${cur?.name ?? "?"}* (\`${cur?.slug ?? "?"}\`)`);
      return;
    }
    const project = await getProjectBySlug(slug);
    if (!project) {
      await send(owner, `Проєкт \`${slug}\` не знайдено.`);
      return;
    }
    activeProjectId = project.id;
    await send(owner, `✅ Активний проєкт: *${project.name}*`);
    return;
  }

  // /agent <slug> <text>
  if (/^\/agent\b/i.test(trimmed)) {
    const rest = trimmed.replace(/^\/agent\b/i, "").trim();
    const [slug, ...words] = rest.split(/\s+/);
    const message = words.join(" ").trim();
    if (!slug || !message) {
      await send(owner, "Формат: `/agent <slug> <повідомлення>`");
      return;
    }
    const agent = await findAgentBySlug(slug);
    if (!agent) {
      await send(owner, `Агента \`${slug}\` не знайдено.`);
      return;
    }
    await send(owner, `✍️ ${agent.name} думає…`);
    try {
      const { reply } = await chatWithAgent(agent, projectId, message);
      await send(owner, `*${agent.name}:*\n${reply.content}`);
    } catch (err) {
      await send(owner, `Помилка: ${err instanceof Error ? err.message : String(err)}`);
    }
    return;
  }

  // /task <text>
  if (/^\/task\b/i.test(trimmed)) {
    const goal = trimmed.replace(/^\/task\b/i, "").trim();
    if (!goal) {
      await send(owner, "Формат: `/task <ціль прогону>`");
      return;
    }
    const run = await createRun(projectId, goal, "small", "planning", null);
    await logActivity(run.id, "owner", "created run", `Telegram: ${goal}`);
    await addEvent("run_created", "Прогін створено з Telegram", goal, run.id, projectId);
    kickQueue();
    await send(owner, `🐝 Прогін #${run.id} створено. Стратег планує.`);
    return;
  }

  // /idea <text>
  if (/^\/idea\b/i.test(trimmed)) {
    const body = trimmed.replace(/^\/idea\b/i, "").trim();
    if (!body) {
      await send(owner, "Формат: `/idea <ідея>`");
      return;
    }
    await createIdea({ body, projectId, source: "telegram" });
    await send(owner, "💡 Ідею збережено в інбокс.");
    return;
  }

  // За замовчуванням — Стратег.
  const strategist = await findAgentBySlug("strategist");
  if (!strategist) {
    await send(owner, "Стратега не знайдено.");
    return;
  }
  await send(owner, "✍️ Стратег думає…");
  try {
    const { reply } = await chatWithAgent(strategist, projectId, trimmed);
    await send(owner, `*Стратег:*\n${reply.content}`);
  } catch (err) {
    await send(owner, `Помилка: ${err instanceof Error ? err.message : String(err)}`);
  }
}

/** Публікація запису контент-плану в Telegram-канал проєкту. */
export async function publishPlanItemToTelegram(
  planId: number,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!env.telegramBotToken) return { ok: false, error: "TELEGRAM_BOT_TOKEN не задано" };
  const item = await getPlanItem(planId);
  if (!item) return { ok: false, error: "Запис плану не знайдено" };

  const profile = await getProfile(item.projectId);
  const channel = profile.telegramChannel.trim();
  if (!channel) {
    return { ok: false, error: "У профілі проєкту не вказано telegram-канал" };
  }

  const body = item.draftId ? await getDraftBody(item.draftId) : "";
  const text = body.trim() || item.title;
  try {
    const res = await fetch(API("sendMessage"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: channel, text, disable_web_page_preview: true }),
    });
    if (!res.ok) {
      return { ok: false, error: `Telegram HTTP ${res.status}` };
    }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
  await updatePlanItem(planId, { status: "published" });
  return { ok: true };
}

/** Запускає long-polling прийому повідомлень (якщо налаштовано). */
export function startTelegramPolling(): void {
  if (polling) return;
  if (!env.telegramBotToken || !env.telegramOwnerChatId) return;
  polling = true;
  console.log("📲 Telegram: двосторонній режим увімкнено (long-polling).");
  void loop();
}

async function loop(): Promise<void> {
  let offset = 0;
  // Скидаємо «хвіст» старих апдейтів, щоб не відповідати на давні повідомлення.
  try {
    const res = await fetch(API("getUpdates") + "?offset=-1");
    const data = (await res.json()) as { result?: { update_id: number }[] };
    const last = data.result?.[data.result.length - 1];
    if (last) offset = last.update_id + 1;
  } catch {
    /* старт без скидання */
  }

  for (;;) {
    try {
      const res = await fetch(API("getUpdates") + `?timeout=30&offset=${offset}`);
      const data = (await res.json()) as {
        result?: { update_id: number; message?: { chat?: { id: number }; text?: string } }[];
      };
      for (const upd of data.result ?? []) {
        offset = upd.update_id + 1;
        const chatId = upd.message?.chat?.id;
        const text = upd.message?.text;
        // Реагуємо лише на повідомлення від власника.
        if (!text || String(chatId) !== String(env.telegramOwnerChatId)) continue;
        await handleMessage(text);
      }
    } catch (err) {
      console.warn("⚠️  Telegram polling помилка, пауза 5с:", err);
      await new Promise((r) => setTimeout(r, 5000));
    }
  }
}
