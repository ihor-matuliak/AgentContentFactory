import { createSdkMcpServer, tool } from "@anthropic-ai/claude-agent-sdk";
import type { McpServerConfig } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import { logActivity } from "../journal.js";

/** Контекст, до якого прив'язані інструменти агента в прогоні. */
export interface TaskToolContext {
  runId: number;
  taskId: number;
  agentSlug: string;
}

/**
 * «Руки» виконавця в межах одного завдання прогону.
 *
 * Усі інструменти описані через zod і живуть у вбудованому MCP-сервері Claude
 * Agent SDK (виконуються в цьому ж процесі). Вони прив'язані до конкретного
 * прогону/завдання через замикання `ctx`, тож агент не може зачепити чужі дані.
 */
export function buildTaskTools(ctx: TaskToolContext): {
  mcpServers: Record<string, McpServerConfig>;
  allowedTools: string[];
  /** Останній зданий результат (через submit_deliverable), якщо був. */
  getDeliverable: () => string | null;
} {
  let deliverable: string | null = null;

  const recordProgress = tool(
    "record_progress",
    "Коротко занотувати у журнал прогону, над чим ти зараз працюєш (один рядок).",
    { note: z.string().describe("Що саме ти робиш зараз") },
    async (args) => {
      await logActivity(ctx.runId, ctx.agentSlug, "progress", args.note);
      return { content: [{ type: "text", text: "Записано в журнал." }] };
    },
  );

  const submitDeliverable = tool(
    "submit_deliverable",
    "Здати фінальний результат завдання. Передай повний готовий матеріал у Markdown.",
    {
      content: z
        .string()
        .describe("Повний готовий результат завдання у форматі Markdown"),
    },
    async (args) => {
      deliverable = args.content;
      await logActivity(
        ctx.runId,
        ctx.agentSlug,
        "submitted deliverable",
        `${args.content.length} символів`,
      );
      return {
        content: [{ type: "text", text: "Результат прийнято. Завдання виконано." }],
      };
    },
  );

  const server = createSdkMcpServer({
    name: "swarm",
    version: "1.0.0",
    tools: [recordProgress, submitDeliverable],
  });

  return {
    mcpServers: { swarm: server },
    allowedTools: [
      "mcp__swarm__record_progress",
      "mcp__swarm__submit_deliverable",
    ],
    getDeliverable: () => deliverable,
  };
}
