import { query } from "@anthropic-ai/claude-agent-sdk";
import type { McpServerConfig, PermissionResult } from "@anthropic-ai/claude-agent-sdk";
import { env } from "../env.js";

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
 * Низькорівневий виклик одного агента поверх Claude Agent SDK.
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
}): Promise<AgentRunResult> {
  const allowed = opts.allowedTools ?? [];

  const response = query({
    prompt: opts.prompt,
    options: {
      systemPrompt: opts.systemPrompt,
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

  try {
    for await (const message of response) {
      if (message.type !== "result") continue;
      usage = {
        inputTokens: message.usage?.input_tokens ?? 0,
        outputTokens: message.usage?.output_tokens ?? 0,
        costUsd: message.total_cost_usd ?? 0,
      };
      if (message.subtype === "success" && !message.is_error) {
        text = message.result;
      } else {
        problem =
          "result" in message && typeof message.result === "string"
            ? message.result
            : message.subtype;
      }
    }
  } catch (err) {
    if (!problem) problem = err instanceof Error ? err.message : String(err);
  }

  if (text) return { text: text.trim(), usage };

  if (problem && looksLikeAuthError(problem)) {
    throw new Error(
      "Claude відхилив автентифікацію. Перевірте CLAUDE_CODE_OAUTH_TOKEN/ANTHROPIC_API_KEY у .env " +
        "або вхід через `claude /login`.",
    );
  }
  throw new Error(problem ?? "Агент не повернув відповіді");
}
