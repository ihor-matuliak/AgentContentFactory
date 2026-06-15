import { query as claudeQuery } from "@anthropic-ai/claude-agent-sdk";
import type { McpServerConfig, PermissionResult } from "@anthropic-ai/claude-agent-sdk";
import { env } from "../env.js";
import { augmentSystemPrompt } from "../context.js";
import { query as dbQuery } from "../db.js";
import { GoogleGenAI } from "@google/genai";

/** Витрати одного виклику моделі. */
export interface Usage {
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
}

export interface AgentRunResult {
  text: string;
  usage: Usage;
}

const ZERO_USAGE: Usage = { inputTokens: 0, outputTokens: 0, costUsd: 0 };

function looksLikeAuthError(text: string): boolean {
  return /401|authentication|invalid bearer|please run \/login|unauthor/i.test(text);
}

/**
 * Низькорівневий виклик одного агента поверх Claude Agent SDK або Gemini SDK.
 *
 * На відміну від чат-рушія (conversational.ts), приймає інструменти (MCP),
 * дозволяє кілька кроків (для виклику інструментів) і повертає витрати.
 */
export async function runAgent(opts: {
  systemPrompt: string;
  prompt: string;
  mcpServers?: Record<string, McpServerConfig>;
  allowedTools?: string[];
  maxTurns?: number;
  /** Таймаут виклику, мс. Типово — env.agentTimeoutMs. 0 — без таймауту. */
  timeoutMs?: number;
  /** Проєкт для домішування бренд-профілю + знань (Фаза 5). */
  projectId?: number | null;
  /** Текст для пошуку релевантних знань (зазвичай — опис завдання). */
  contextQuery?: string;
  /** Slug агента — для фільтра видимості знань (visible_to_agents). */
  agentSlug?: string | null;
  /**
   * Імена «здавальних» інструментів (напр. submit_deliverable). Щойно агент
   * викликає такий інструмент — результат уже зафіксовано, тож перериваємо
   * потік, аби агент не марнував час (і таймаут) на зайву «післямову».
   */
  stopOnTools?: string[];
}): Promise<AgentRunResult> {
  // Зчитуємо активну модель з БД
  const dbRes = await dbQuery<{ value: string }>(
    "SELECT value FROM system_settings WHERE key = 'active_model'"
  );
  const activeModel = dbRes.rows[0]?.value ?? "claude-sonnet-4-6";

  if (activeModel === "gemini-3-1-flash-lite") {
    const runGemini = async (): Promise<AgentRunResult> => {
      if (!env.geminiApiKey) {
        throw new Error("Відсутня обов'язкова змінна оточення: GEMINI_API_KEY. Будь ласка, додайте її у .env.");
      }
      const ai = new GoogleGenAI({ apiKey: env.geminiApiKey });
      const systemPrompt = await augmentSystemPrompt({
        systemPrompt: opts.systemPrompt,
        projectId: opts.projectId,
        query: opts.contextQuery,
        agentSlug: opts.agentSlug,
      });

      const allowed = opts.allowedTools ?? [];
      const toolsList: any[] = [];
      if (allowed.length > 0 && opts.mcpServers) {
        const declarations: any[] = [];
        if (allowed.includes("mcp__swarm__record_progress")) {
          declarations.push({
            name: "mcp__swarm__record_progress",
            description: "Коротко занотувати у журнал прогону, над чим ти зараз працюєш (один рядок).",
            parameters: {
              type: "object",
              properties: {
                note: { type: "string", description: "Що саме ти робиш зараз" }
              },
              required: ["note"]
            }
          });
        }
        if (allowed.includes("mcp__swarm__submit_deliverable")) {
          declarations.push({
            name: "mcp__swarm__submit_deliverable",
            description: "Здати фінальний результат завдання. Передай повний готовий матеріал у Markdown.",
            parameters: {
              type: "object",
              properties: {
                content: { type: "string", description: "Повний готовий результат завдання у форматі Markdown" }
              },
              required: ["content"]
            }
          });
        }
        if (allowed.includes("mcp__swarm__ask_owner")) {
          declarations.push({
            name: "mcp__swarm__ask_owner",
            description: "Поставити власнику ОДНЕ уточнювальне питання, якщо без відповіді неможливо якісно виконати завдання. Використовуй лише за реальної потреби — це ставить завдання на паузу до відповіді власника.",
            parameters: {
              type: "object",
              properties: {
                question: { type: "string", description: "Чітке коротке питання до власника українською" }
              },
              required: ["question"]
            }
          });
        }
        if (declarations.length > 0) {
          toolsList.push({ functionDeclarations: declarations });
        }
      }

      const contents: any[] = [
        { role: "user", parts: [{ text: opts.prompt }] }
      ];

      let turn = 0;
      const maxTurns = opts.maxTurns ?? (allowed.length > 0 ? 6 : 1);
      let text = "";
      let totalInputTokens = 0;
      let totalOutputTokens = 0;

      while (turn < maxTurns) {
        const config: any = {
          systemInstruction: {
            parts: [{ text: systemPrompt }]
          }
        };
        if (toolsList.length > 0) {
          config.tools = toolsList;
        }

        let response;
        try {
          response = await ai.models.generateContent({
            model: "gemini-3.1-flash-lite",
            contents,
            config,
          });
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

        const inTokens = response.usageMetadata?.promptTokenCount ?? 0;
        const outTokens = response.usageMetadata?.candidatesTokenCount ?? 0;
        totalInputTokens += inTokens;
        totalOutputTokens += outTokens;

        if (response.functionCalls && response.functionCalls.length > 0) {
          if (response.candidates?.[0]?.content) {
            contents.push(response.candidates[0].content);
          } else {
            contents.push({
              role: "model",
              parts: response.functionCalls.map(call => ({ functionCall: call }))
            });
          }

          const functionResponses: any[] = [];
          for (const call of response.functionCalls) {
            const toolNameKey = call.name || "";
            const match = toolNameKey.match(/^mcp__([a-zA-Z0-9_-]+)__([a-zA-Z0-9_-]+)$/);
            let resultData: any = { status: "error", message: `Tool ${toolNameKey} not found.` };
            if (match) {
              const serverName = match[1];
              const toolName = match[2];
              const server = opts.mcpServers?.[serverName];
              const registeredTool = (server as any)?.instance?._registeredTools?.[toolName];
              if (registeredTool && typeof registeredTool.handler === "function") {
                try {
                  const res = await registeredTool.handler(call.args);
                  resultData = res;
                } catch (err: any) {
                  resultData = { status: "error", message: err.message || String(err) };
                }
              }
            }
            functionResponses.push({
              functionResponse: {
                name: toolNameKey,
                response: resultData
              }
            });
          }

          contents.push({
            role: "function",
            parts: functionResponses
          });

          // Агент здав результат → далі генерувати нічого (deliverable уже
          // зафіксовано в замиканні інструмента). Завершуємо цикл.
          const stopTools = opts.stopOnTools ?? [];
          if (
            stopTools.length > 0 &&
            response.functionCalls.some((c) => c.name && stopTools.includes(c.name))
          ) {
            break;
          }

          turn++;
        } else {
          text = response.text || "";
          break;
        }
      }

      const costUsd = (totalInputTokens * 0.25 + totalOutputTokens * 1.50) / 1000000;
      const usage = {
        inputTokens: totalInputTokens,
        outputTokens: totalOutputTokens,
        costUsd,
      };

      return { text: text.trim(), usage };
    };

    const timeoutMs = opts.timeoutMs ?? env.agentTimeoutMs;
    if (timeoutMs > 0) {
      let timer: any;
      const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          reject(new Error(`Таймаут агента (${Math.round(timeoutMs / 1000)} с)`));
        }, timeoutMs);
      });
      try {
        return await Promise.race([runGemini(), timeout]);
      } finally {
        clearTimeout(timer);
      }
    } else {
      return await runGemini();
    }
  }

  // Сценарій Claude
  const allowed = opts.allowedTools ?? [];

  const response = claudeQuery({
    prompt: opts.prompt,
    options: {
      // Домішуємо бренд-контекст проєкту + релевантні знання до характеру агента.
      systemPrompt: await augmentSystemPrompt({
        systemPrompt: opts.systemPrompt,
        projectId: opts.projectId,
        query: opts.contextQuery,
        agentSlug: opts.agentSlug,
      }),
      model: env.anthropicModel,
      maxTurns: opts.maxTurns ?? (allowed.length > 0 ? 6 : 1),
      // Жодних вбудованих інструментів Claude Code — лише наші MCP-інструменти.
      tools: [],
      allowedTools: allowed,
      mcpServers: opts.mcpServers ?? {},
      settingSources: [],
      // Авто-дозвіл саме для наших MCP-інструментів рою.
      canUseTool: async (toolName, input): Promise<PermissionResult> => {
        if (allowed.includes(toolName)) {
          return { behavior: "allow", updatedInput: input };
        }
        return { behavior: "deny", message: `Інструмент ${toolName} недоступний у прогоні.` };
      },
    },
  });

  let text = "";
  let usage: Usage = { ...ZERO_USAGE };
  let problem: string | null = null;

  const stopOnTools = opts.stopOnTools ?? [];
  // Агент уже здав результат через «здавальний» інструмент (submit_deliverable):
  // текст у відповіді нам уже не потрібен, бо результат — у замиканні інструмента.
  let completedViaTool = false;
  let pendingStop = false;
  let interruptedAfterSubmit = false;

  const interruptStream = (): void => {
    try {
      const r = (response as { interrupt?: () => unknown }).interrupt?.();
      if (r && typeof (r as Promise<unknown>).then === "function") {
        void (r as Promise<unknown>).catch(() => {});
      }
    } catch {
      /* нічого */
    }
  };

  // Споживання стріму з таймаутом: якщо агент «завис» — переривання за timeoutMs.
  const consume = async (): Promise<void> => {
    for await (const message of response) {
      // Сигнал завершення: агент викликав здавальний інструмент.
      if (stopOnTools.length > 0 && message.type === "assistant") {
        const blocks = ((message as { message?: { content?: unknown[] } }).message
          ?.content ?? []) as Array<{ type?: string; name?: string }>;
        if (
          blocks.some(
            (b) => b.type === "tool_use" && b.name && stopOnTools.includes(b.name),
          )
        ) {
          completedViaTool = true;
          pendingStop = true;
        }
      }

      if (message.type === "result") {
        usage = {
          inputTokens: message.usage?.input_tokens ?? 0,
          outputTokens: message.usage?.output_tokens ?? 0,
          costUsd: message.total_cost_usd ?? 0,
        };
        if (message.subtype === "success" && !message.is_error) {
          text = message.result;
        } else if (!completedViaTool) {
          // Помилку фіксуємо лише якщо агент НЕ здав результат через інструмент
          // (інакше «error_during_execution» — це наслідок нашого ж interrupt).
          problem =
            "result" in message && typeof message.result === "string"
              ? message.result
              : message.subtype;
        }
        continue;
      }

      // tool_result для здавального інструмента вже оброблено (deliverable
      // зафіксовано) → перериваємо потік, щоб уникнути зайвої генерації.
      if (pendingStop && message.type === "user" && !interruptedAfterSubmit) {
        interruptedAfterSubmit = true;
        interruptStream();
      }
    }
  };

  const timeoutMs = opts.timeoutMs ?? env.agentTimeoutMs;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let timedOut = false;
  try {
    if (timeoutMs > 0) {
      const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          timedOut = true;
          reject(new Error(`Таймаут агента (${Math.round(timeoutMs / 1000)} с)`));
        }, timeoutMs);
      });
      await Promise.race([consume(), timeout]);
    } else {
      await consume();
    }
  } catch (err) {
    if (!problem) problem = err instanceof Error ? err.message : String(err);
  } finally {
    if (timer) clearTimeout(timer);
    // Перериваємо підпроцес Claude ЛИШЕ якщо спрацював таймаут (інакше query
    // вже завершено, і interrupt кине «ProcessTransport is not ready»).
    if (timedOut) interruptStream();
  }

  if (text) return { text: text.trim(), usage };

  // Агент здав результат через інструмент (deliverable у замиканні викликача):
  // повертаємо порожній текст без помилки — викликач візьме сам deliverable.
  if (completedViaTool) return { text: "", usage };

  if (problem && looksLikeAuthError(problem)) {
    throw new Error(
      "Claude відхилив автентифікацію. Перевірте CLAUDE_CODE_OAUTH_TOKEN/ANTHROPIC_API_KEY у .env " +
        "або вхід через `claude /login`.",
    );
  }
  throw new Error(problem ?? "Агент не повернув відповіді");
}

