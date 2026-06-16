import { createSdkMcpServer, tool } from "@anthropic-ai/claude-agent-sdk";
import type { McpServerConfig } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import { logActivity } from "../journal.js";
import { generateImages } from "../higgsfield.js";
import { listAgentImageRefPaths } from "../knowledge.js";
import { addRunUsage, addTaskUsage, createGeneratedAsset } from "../store.js";

/** Агенти, яким доступний інструмент генерації зображень. */
export const IMAGE_CAPABLE_AGENTS = new Set(["designer"]);

/** Контекст, до якого прив'язані інструменти агента в прогоні. */
export interface TaskToolContext {
  runId: number;
  taskId: number;
  agentSlug: string;
  /** Проєкт — для референсів зі «Знань» і привʼязки згенерованих ассетів. */
  projectId: number;
  /** Обрана для прогону модель генерації зображень (null — серверний дефолт). */
  imageModel?: string | null;
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
  /** Уточнювальне питання до власника (через ask_owner), якщо було. */
  getQuestion: () => string | null;
  /** Скільки зображень згенеровано цим завданням (для маршрутизації на гейт). */
  getGeneratedCount: () => number;
} {
  let deliverable: string | null = null;
  let question: string | null = null;
  let generatedCount = 0;

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

  const askOwner = tool(
    "ask_owner",
    "Поставити власнику ОДНЕ уточнювальне питання, якщо без відповіді неможливо якісно виконати завдання. Використовуй лише за реальної потреби — це ставить завдання на паузу до відповіді власника.",
    {
      question: z
        .string()
        .describe("Чітке коротке питання до власника українською"),
    },
    async (args) => {
      question = args.question;
      await logActivity(ctx.runId, ctx.agentSlug, "asked owner", args.question);
      return {
        content: [
          {
            type: "text",
            text: "Питання надіслано власнику. Завдання на паузі до відповіді.",
          },
        ],
      };
    },
  );

  const generateImage = tool(
    "generate_image",
    "Згенерувати зображення (обкладинку / слайди каруселі) через Higgsfield за твоїм промптом. " +
      "Кількість визначай із завдання. Повертає URL-и; після цього здай набір через submit_deliverable.",
    {
      prompt: z
        .string()
        .describe("Детальний візуальний промпт англійською або українською: композиція, стиль, настрій"),
      count: z
        .number()
        .int()
        .min(1)
        .max(10)
        .optional()
        .describe("Скільки зображень згенерувати (для каруселі). Типово 1"),
      aspect_ratio: z
        .string()
        .optional()
        .describe("Співвідношення сторін: 3:4 (вертикальний IG-пост, типово), 1:1, 9:16, 16:9, 4:3"),
      use_references: z
        .boolean()
        .optional()
        .describe("Чи використовувати референси-зображення зі «Знань» проєкту. Типово true"),
    },
    async (args) => {
      try {
        const refImagePaths =
          (args.use_references ?? true)
            ? await listAgentImageRefPaths(ctx.projectId, ctx.agentSlug)
            : [];
        const result = await generateImages({
          prompt: args.prompt,
          refImagePaths,
          count: args.count ?? 1,
          aspectRatio: args.aspect_ratio,
          model: ctx.imageModel ?? undefined,
          runId: ctx.runId,
        });
        for (let i = 0; i < result.images.length; i++) {
          const img = result.images[i];
          await createGeneratedAsset({
            projectId: ctx.projectId,
            runId: ctx.runId,
            taskId: ctx.taskId,
            ordinal: i,
            prompt: args.prompt,
            model: result.model,
            path: img.path,
            bytes: img.bytes,
            mimeType: img.mimeType,
          });
        }
        generatedCount += result.images.length;
        if (result.costUsd) {
          await addRunUsage(ctx.runId, 0, 0, result.costUsd);
          await addTaskUsage(ctx.taskId, 0, 0, result.costUsd);
        }
        await logActivity(
          ctx.runId,
          ctx.agentSlug,
          "generated images",
          `${result.images.length} via ${result.model}`,
        );
        const list = result.images.map((im, i) => `${i + 1}. ${im.url}`).join("\n");
        return {
          content: [
            {
              type: "text",
              text:
                `Згенеровано ${result.images.length} зображень (${result.model}):\n${list}\n\n` +
                "Тепер здай набір через submit_deliverable з коротким описом візуалу.",
            },
          ],
        };
      } catch (err) {
        await logActivity(
          ctx.runId,
          "system",
          "image generation failed",
          err instanceof Error ? err.message : String(err),
        );
        return {
          content: [
            {
              type: "text",
              text: `Не вдалося згенерувати зображення: ${err instanceof Error ? err.message : String(err)}. ` +
                "Якщо це повторюється — постав питання власнику через ask_owner.",
            },
          ],
        };
      }
    },
  );

  // generate_image доступний лише агентам, що пакують візуал (Дизайнер).
  const canGenerate = IMAGE_CAPABLE_AGENTS.has(ctx.agentSlug);
  const extraTools = canGenerate ? [generateImage] : [];
  const extraAllowed = canGenerate ? ["mcp__swarm__generate_image"] : [];

  const server = createSdkMcpServer({
    name: "swarm",
    version: "1.0.0",
    tools: [recordProgress, submitDeliverable, askOwner, ...extraTools],
  });

  return {
    mcpServers: { swarm: server },
    allowedTools: [
      "mcp__swarm__record_progress",
      "mcp__swarm__submit_deliverable",
      "mcp__swarm__ask_owner",
      ...extraAllowed,
    ],
    getDeliverable: () => deliverable,
    getQuestion: () => question,
    getGeneratedCount: () => generatedCount,
  };
}
