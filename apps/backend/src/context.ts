import { getProfileBlock } from "./profile.js";
import { getKnowledgeBlock } from "./knowledge.js";

/**
 * Композиція системного промпту агента з контекстом проєкту (Фаза 5):
 * характер агента + бренд-профіль + релевантні шматки бази знань.
 *
 * Викликається з рушія чату (conversational.ts) та виклику агента (runner.ts).
 * Якщо projectId не задано (напр., фабрика тестів) — повертаємо «голий»
 * системний промпт, щоб тестувати саме характер агента.
 */
export async function augmentSystemPrompt(opts: {
  systemPrompt: string;
  projectId?: number | null;
  /** Текст запиту/завдання — за ним шукаємо релевантні знання. */
  query?: string;
}): Promise<string> {
  if (!opts.projectId) return opts.systemPrompt;

  const [profileBlock, knowledgeBlock] = await Promise.all([
    getProfileBlock(opts.projectId),
    opts.query ? getKnowledgeBlock(opts.projectId, opts.query) : Promise.resolve(""),
  ]);

  const parts = [opts.systemPrompt, profileBlock, knowledgeBlock].filter(Boolean);
  return parts.join("\n\n");
}
