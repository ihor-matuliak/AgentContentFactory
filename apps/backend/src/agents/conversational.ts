import { query as claudeQuery } from "@anthropic-ai/claude-agent-sdk";
import type { Agent, ChatMessage } from "@swarm/shared";
import { env } from "../env.js";
import { augmentSystemPrompt } from "../context.js";
import { query as dbQuery } from "../db.js";
import { GoogleGenAI } from "@google/genai";

/** Ознаки того, що SDK не зміг автентифікуватися в Claude. */
function looksLikeAuthError(text: string): boolean {
  return /401|authentication|invalid bearer|please run \/login|unauthor/i.test(
    text,
  );
}

/**
 * Рушій діалогу поверх Claude Agent SDK або Gemini SDK.
 *
 * Бере системний промпт агента (його «характер»), історію чату та нове
 * повідомлення користувача, відправляє все у Claude/Gemini й повертає текст відповіді.
 */
export async function generateAgentReply(
  agent: Agent,
  history: ChatMessage[],
  userMessage: string,
  projectId: number,
): Promise<string> {
  // Зчитуємо активну модель з БД
  const dbRes = await dbQuery<{ value: string }>(
    "SELECT value FROM system_settings WHERE key = 'active_model'"
  );
  const activeModel = dbRes.rows[0]?.value ?? "claude-sonnet-4-6";

  // Agent SDK не зберігає стан між викликами, тому відтворюємо діалог як текст.
  const transcript = history
    .filter((m) => m.role === "user" || m.role === "assistant")
    .map((m) => `${m.role === "user" ? "Користувач" : agent.name}: ${m.content}`)
    .join("\n\n");

  const prompt = transcript
    ? `Ось попередня переписка:\n\n${transcript}\n\nКористувач: ${userMessage}\n\nВідповідай як ${agent.name} на останнє повідомлення користувача.`
    : userMessage;

  const systemPrompt = await augmentSystemPrompt({
    systemPrompt: agent.systemPrompt,
    projectId,
    query: userMessage,
    agentSlug: agent.slug,
  });

  if (activeModel === "gemini-3-1-flash-lite") {
    if (!env.geminiApiKey) {
      throw new Error("Відсутня обов'язкова змінна оточення: GEMINI_API_KEY. Будь ласка, додайте її у .env.");
    }
    const ai = new GoogleGenAI({ apiKey: env.geminiApiKey });
    try {
      const response = await ai.models.generateContent({
        model: "gemini-3.1-flash-lite",
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        config: {
          systemInstruction: {
            parts: [{ text: systemPrompt }]
          }
        }
      });
      return (response.text || "").trim();
    } catch (err: any) {
      if (
        err.message?.includes("API_KEY_INVALID") ||
        err.message?.includes("API key not valid") ||
        err.status === 401 ||
        err.status === 403
      ) {
        throw new Error("Gemini відхилив автентифікацію. Перевірте GEMINI_API_KEY у .env.");
      }
      throw err;
    }
  }

  // Сценарій Claude
  const response = claudeQuery({
    prompt,
    options: {
      // Домішуємо бренд-контекст проєкту + релевантні знання до характеру агента.
      systemPrompt,
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

