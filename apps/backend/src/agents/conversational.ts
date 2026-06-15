import { query } from "@anthropic-ai/claude-agent-sdk";
import type { Agent, ChatMessage } from "@swarm/shared";
import { env } from "../env.js";
import { withProfile } from "../profile.js";

/** Ознаки того, що SDK не зміг автентифікуватися в Claude. */
function looksLikeAuthError(text: string): boolean {
  return /401|authentication|invalid bearer|please run \/login|unauthor/i.test(
    text,
  );
}

/**
 * Рушій діалогу поверх Claude Agent SDK.
 *
 * Бере системний промпт агента (його «характер»), історію чату та нове
 * повідомлення користувача, відправляє все у Claude й повертає текст відповіді.
 *
 * Доступ до Claude — через CLAUDE_CODE_OAUTH_TOKEN або ANTHROPIC_API_KEY
 * (їх читає сам Agent SDK з оточення). Модель — з ANTHROPIC_MODEL.
 */
export async function generateAgentReply(
  agent: Agent,
  history: ChatMessage[],
  userMessage: string,
): Promise<string> {
  // Agent SDK не зберігає стан між викликами, тому відтворюємо діалог як текст.
  const transcript = history
    .filter((m) => m.role === "user" || m.role === "assistant")
    .map((m) => `${m.role === "user" ? "Користувач" : agent.name}: ${m.content}`)
    .join("\n\n");

  const prompt = transcript
    ? `Ось попередня переписка:\n\n${transcript}\n\nКористувач: ${userMessage}\n\nВідповідай як ${agent.name} на останнє повідомлення користувача.`
    : userMessage;

  const response = query({
    prompt,
    options: {
      // Домішуємо бренд-контекст проєкту до характеру агента.
      systemPrompt: await withProfile(agent.systemPrompt),
      model: env.anthropicModel,
      // Розмова без інструментів і файлової системи — чистий діалог.
      maxTurns: 1,
      allowedTools: [],
      settingSources: [],
    },
  });

  let reply = "";
  let problem: string | null = null;

  try {
    for await (const message of response) {
      if (message.type !== "result") continue;
      if (message.subtype === "success" && !message.is_error) {
        reply = message.result;
      } else {
        // Помилка могла повернутися як result-повідомлення (напр., 401),
        // або просто інший subtype.
        problem =
          "result" in message && typeof message.result === "string"
            ? message.result
            : message.subtype;
      }
    }
  } catch (err) {
    // Підпроцес Claude Code може завершитися кодом 1 після помилки API —
    // якщо причину вже зафіксовано в `problem`, повідомимо саме її.
    if (!problem) {
      problem = err instanceof Error ? err.message : String(err);
    }
  }

  if (reply) return reply.trim();

  if (problem && looksLikeAuthError(problem)) {
    throw new Error(
      "Claude відхилив автентифікацію. Вкажіть дійсний CLAUDE_CODE_OAUTH_TOKEN у .env " +
        "(згенеруйте командою `claude setup-token`) або залиште його порожнім, " +
        "якщо ви увійшли в Claude Code на цій машині.",
    );
  }

  throw new Error(problem ?? "Агент не повернув відповіді");
}
