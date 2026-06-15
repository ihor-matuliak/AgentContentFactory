import type { Agent, CriticVerdict, RunTask } from "@swarm/shared";
import { query } from "../db.js";
import { addEvent, logActivity } from "../journal.js";
import { notifyOwner } from "../notify.js";
import {
  addRunUsage,
  addTaskUsage,
  createTask,
  getRun,
  getTask,
  listTasks,
  setRunStatus,
  setRunSummary,
  setTaskCritique,
  setTaskQuestion,
  setTaskResult,
  setTaskStatus,
} from "../store.js";
import { runAgent, type Usage } from "./runner.js";
import { buildTaskTools } from "./tools.js";

/** Максимум кіл автодоопрацювання Критиком. */
const MAX_REVISION_ROUNDS = 2;

/** Slug-и агентів-координаторів, які не стають виконавцями. */
const COORDINATOR_SLUGS = new Set(["strategist", "critic"]);

interface AgentRow {
  id: number;
  slug: string;
  name: string;
  role: string;
  system_prompt: string;
  status: string;
  is_active: boolean;
}

function toAgent(row: AgentRow): Agent {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    role: row.role,
    systemPrompt: row.system_prompt,
    status: row.status as Agent["status"],
    isActive: row.is_active,
  };
}

async function getAgent(slug: string): Promise<Agent | null> {
  const { rows } = await query<AgentRow>(
    "SELECT * FROM agents WHERE slug = $1 LIMIT 1",
    [slug],
  );
  return rows[0] ? toAgent(rows[0]) : null;
}

/** Активні виконавці = усі активні агенти, крім strategist та critic. */
async function listExecutors(): Promise<Agent[]> {
  const { rows } = await query<AgentRow>(
    "SELECT * FROM agents WHERE is_active = TRUE ORDER BY id ASC",
  );
  return rows.map(toAgent).filter((a) => !COORDINATOR_SLUGS.has(a.slug));
}

/** Дістає перший JSON-обʼєкт/масив із тексту (зрізає ```-огорожі та зайве). */
function extractJson(text: string): unknown {
  const cleaned = text.replace(/```json/gi, "```").replace(/```/g, "");
  const start = cleaned.search(/[[{]/);
  if (start === -1) throw new Error("У відповіді немає JSON");
  // Знаходимо парну дужку від першої відкритої.
  const open = cleaned[start];
  const close = open === "[" ? "]" : "}";
  let depth = 0;
  for (let i = start; i < cleaned.length; i++) {
    if (cleaned[i] === open) depth++;
    else if (cleaned[i] === close) {
      depth--;
      if (depth === 0) return JSON.parse(cleaned.slice(start, i + 1));
    }
  }
  throw new Error("Не вдалося розібрати JSON у відповіді");
}

async function accrue(runId: number, taskId: number | null, usage: Usage): Promise<void> {
  await addRunUsage(runId, usage.inputTokens, usage.outputTokens, usage.costUsd);
  if (taskId !== null) {
    await addTaskUsage(taskId, usage.inputTokens, usage.outputTokens, usage.costUsd);
  }
}

// ──────────────────────────────── Планування ─────────────────────────────────

interface PlannedTask {
  agent: string;
  description: string;
  dependsOn: number[];
}

/**
 * Викликає Стратега для планування й розбирає JSON, з однією повторною спробою:
 * якщо у відповіді немає валідного JSON (Стратег відповів прозою) — просимо ще
 * раз, уже жорстко вимагаючи лише JSON.
 */
async function planWithRetry(
  runId: number,
  projectId: number,
  systemPrompt: string,
  basePrompt: string,
): Promise<PlannedTask[]> {
  const attempts = [
    basePrompt,
    `${basePrompt}\n\nУВАГА: попередня відповідь була неприйнятна. Виведи ЛИШЕ JSON-обʼєкт, що починається з «{» і закінчується «}». Жодного іншого тексту.`,
  ];
  let lastErr: unknown;
  for (const prompt of attempts) {
    const { text, usage } = await runAgent({ systemPrompt, prompt, projectId });
    await accrue(runId, null, usage);
    try {
      const parsed = extractJson(text) as { tasks?: PlannedTask[] } | PlannedTask[];
      const tasks = Array.isArray(parsed) ? parsed : parsed.tasks ?? [];
      if (tasks.length > 0) return tasks;
      lastErr = new Error("порожній план");
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr ?? new Error("План не сформовано");
}

/**
 * Стратег розбиває ціль прогону на завдання. Створює рядки tasks, проставляє
 * залежності та визначає розмір прогону (>1 завдання → великий, потребує
 * схвалення плану). Повертає, чи прогін одразу стартує (small).
 */
export async function planRun(runId: number): Promise<void> {
  const run = await getRun(runId);
  if (!run || run.status !== "planning") return;

  const strategist = await getAgent("strategist");
  if (!strategist) {
    await setRunStatusFailed(runId, "Агента strategist не знайдено");
    return;
  }
  const executors = await listExecutors();
  if (executors.length === 0) {
    await setRunStatusFailed(runId, "Немає активних виконавців");
    return;
  }

  const roster = executors
    .map((a) => `- ${a.slug} (${a.name}): ${a.role}`)
    .join("\n");

  const planPrompt = `Ти — диспетчер задач рою. Твоя задача зараз — НЕ розширювати ціль, а рівно її виконати, роздавши роботу.

Ціль власника: «${run.goal}»

Доступні виконавці рою:
${roster}

ЗОЛОТЕ ПРАВИЛО ОБСЯГУ: плануй РІВНО те, що просить власник — ні більше, ні менше. Не вигадуй додаткових кроків, стратегій, аналізу аудиторії чи публікації, якщо про них прямо не просили. Менше завдань — краще.
- Якщо ціль — це один матеріал/ідея (напр. «придумай підпис», «один слоган», «назва відео», «короткий скрипт») → створи РІВНО ОДНЕ завдання для одного найдоречнішого виконавця.
- Кілька завдань став ЛИШЕ коли ціль явно потребує різних виконавців із послідовністю (напр. «зроби серію рілсів: сценарій → монтаж → публікація»).

Приклади:
- Ціль «Придумай один підпис до фото» → [{ "agent": "scriptwriter", "description": "Придумати один короткий підпис до фото", "dependsOn": [] }]  (саме одне завдання)
- Ціль «Зроби 3 рілси під ключ» → кілька завдань: scriptwriter → reelsmaker → video-editor → publisher.

Використовуй лише slug-и зі списку. Незалежне завдання → dependsOn: [].

ФОРМАТ ВІДПОВІДІ — найважливіше: поверни РІВНО один JSON-обʼєкт і НІЧОГО більше (без вітань, без пояснень, без markdown-огорожі). Починай відповідь символом «{».
{
  "tasks": [
    { "agent": "<slug виконавця зі списку>", "description": "<чітке завдання українською>", "dependsOn": [<0-based індекси завдань-залежностей>] }
  ]
}`;

  let planned: PlannedTask[];
  try {
    planned = await planWithRetry(runId, run.projectId, strategist.systemPrompt, planPrompt);
  } catch (err) {
    await setRunStatusFailed(
      runId,
      `Планування не вдалося: ${err instanceof Error ? err.message : String(err)}`,
    );
    return;
  }

  const validSlugs = new Set(executors.map((a) => a.slug));
  const clean = planned
    .filter((t) => t && typeof t.description === "string")
    .map((t) => ({
      agent: validSlugs.has(t.agent) ? t.agent : executors[0].slug,
      description: t.description.trim(),
      dependsOn: Array.isArray(t.dependsOn) ? t.dependsOn : [],
    }))
    .filter((t) => t.description.length > 0);

  if (clean.length === 0) {
    await setRunStatusFailed(runId, "Стратег не сформував жодного завдання");
    return;
  }

  // Створюємо завдання й мапимо 0-based індекси залежностей у реальні id.
  const createdIds: number[] = [];
  for (let i = 0; i < clean.length; i++) {
    const t = clean[i];
    const dependsOn = t.dependsOn
      .filter((idx) => idx >= 0 && idx < i)
      .map((idx) => createdIds[idx]);
    const task = await createTask({
      runId,
      agentSlug: t.agent,
      description: t.description,
      sortOrder: i,
      dependsOn,
    });
    createdIds.push(task.id);
  }

  // Розмір: ніколи не нижче заданого; кілька завдань → великий.
  const desiredLarge = clean.length > 1 || run.size === "large";
  if (desiredLarge) {
    await query("UPDATE runs SET size = 'large', updated_at = now() WHERE id = $1", [runId]);
  }

  const summarySlugs = clean.map((t) => t.agent).join(", ");
  await logActivity(
    runId,
    "strategist",
    "planned run",
    `${clean.length} завдань: ${summarySlugs}`,
  );

  if (desiredLarge) {
    // Великий прогін — чекає на схвалення плану власником.
    await setRunStatus(runId, "awaiting_approval");
    await addEvent(
      "plan_ready",
      "План готовий — перегляньте та запустіть",
      `Стратег запланував ${clean.length} завдань для цілі: ${run.goal}`,
      runId,
    );
    await notifyOwner(
      "🐝 План рою готовий до запуску",
      `Ціль: ${run.goal}\nЗавдань: ${clean.length}. Зайдіть у дашборд, щоб запустити.`,
    );
  } else {
    // Дрібний прогін стартує одразу.
    await setRunStatus(runId, "running");
    await addEvent("run_started", "Прогін рою запущено", run.goal, runId);
    await logActivity(runId, "system", "started run", "");
  }
}

/** Власник схвалив план великого прогону → запускаємо виконання. */
export async function approvePlan(runId: number): Promise<boolean> {
  const run = await getRun(runId);
  if (!run || run.status !== "awaiting_approval") return false;
  await setRunStatus(runId, "running");
  await logActivity(runId, "owner", "approved plan", "");
  await addEvent("run_started", "Прогін рою запущено", run.goal, runId);
  return true;
}

// ──────────────────────────────── Виконання ──────────────────────────────────

/**
 * Виконує одне завдання: виконавець робить роботу → Критик перевіряє.
 * До MAX_REVISION_ROUNDS кіл автодоопрацювання. Повертає, коли завдання
 * переходить у `done` або `failed`.
 */
export async function executeTask(taskId: number): Promise<void> {
  const task = await getTask(taskId);
  if (!task || (task.status !== "pending" && task.status !== "in_progress")) return;
  const run = await getRun(task.runId);
  if (!run) return;

  const executor = await getAgent(task.agentSlug);
  if (!executor) {
    await setTaskStatus(taskId, "failed");
    await logActivity(task.runId, "system", "task failed", `Немає агента ${task.agentSlug}`);
    return;
  }

  await setTaskStatus(taskId, "in_progress");
  await logActivity(task.runId, task.agentSlug, "started task", task.description);

  // Контекст: результати завдань-залежностей.
  const allTasks = await listTasks(task.runId);
  const deps = allTasks.filter((t) => task.dependsOn.includes(t.id));
  const depsBlock = deps.length
    ? `\n\nРезультати попередніх завдань, на які спирайся:\n${deps
        .map((d) => `### ${d.agentName ?? d.agentSlug}\n${d.result}`)
        .join("\n\n")}`
    : "";

  const revisionBlock = buildRevisionNote(task);
  // Якщо завдання відновлюється після відповіді власника — додаємо її в контекст.
  const answerBlock =
    task.question && task.answer
      ? `\n\nТи раніше запитав власника: «${task.question}»\nВідповідь власника: «${task.answer}»\nВрахуй її та виконай завдання повністю.`
      : "";

  const tools = buildTaskTools({
    runId: task.runId,
    taskId,
    agentSlug: task.agentSlug,
  });

  const prompt = `Загальна ціль прогону: «${run.goal}»

Твоє завдання: ${task.description}${depsBlock}${revisionBlock}${answerBlock}

Зроби роботу й здай готовий результат через інструмент submit_deliverable (повний матеріал у Markdown). За потреби фіксуй кроки через record_progress. Якщо без уточнення від власника якісно виконати неможливо — постав ОДНЕ питання через ask_owner (лише за реальної потреби).`;

  let result: string;
  try {
    const { text, usage } = await runAgent({
      systemPrompt: executor.systemPrompt,
      prompt,
      mcpServers: tools.mcpServers,
      allowedTools: tools.allowedTools,
      projectId: run.projectId,
      contextQuery: task.description,
    });
    await accrue(task.runId, taskId, usage);

    // Виконавець поставив уточнювальне питання й нічого не здав → пауза.
    const question = tools.getQuestion();
    if (question && !tools.getDeliverable()) {
      await setTaskQuestion(taskId, question);
      await logActivity(task.runId, task.agentSlug, "waiting for answer", question);
      await addEvent(
        "question_asked",
        "Агент чекає на твою відповідь",
        question,
        task.runId,
      );
      await notifyOwner(
        "❓ Агент рою має питання",
        `${executor.name}: ${question}\nЦіль: ${run.goal}`,
      );
      return;
    }

    result = tools.getDeliverable() ?? text;
  } catch (err) {
    await setTaskStatus(taskId, "failed");
    await logActivity(
      task.runId,
      "system",
      "task failed",
      err instanceof Error ? err.message : String(err),
    );
    return;
  }

  await setTaskResult(taskId, result);
  await logActivity(task.runId, task.agentSlug, "completed task", "");

  // ── Перевірка Критиком ──
  await reviewByCritic(taskId);
}

function buildRevisionNote(task: RunTask): string {
  const notes: string[] = [];
  if (task.criticVerdict === "needs_revision" && task.criticComment) {
    notes.push(`Зауваження Критика з минулого кола: ${task.criticComment}`);
  }
  if (task.ownerFeedback) {
    notes.push(`Коментар власника: ${task.ownerFeedback}`);
  }
  if (notes.length === 0) return "";
  return `\n\nЦе доопрацювання (коло ${task.revisionRound}). Врахуй:\n- ${notes.join("\n- ")}`;
}

async function reviewByCritic(taskId: number): Promise<void> {
  const task = await getTask(taskId);
  if (!task) return;
  const run = await getRun(task.runId);
  if (!run) return;

  const critic = await getAgent("critic");
  if (!critic) {
    // Без Критика просто приймаємо результат.
    await setTaskStatus(taskId, "done");
    return;
  }

  const prompt = `Ціль прогону: «${run.goal}»
Завдання: ${task.description}

Результат виконавця:
"""
${task.result}
"""

Оціни, чи результат якісно й повно виконує завдання. Поверни ЛИШЕ JSON:
{ "verdict": "approved" | "needs_revision", "comment": "<стислий вердикт українською>" }`;

  let verdict: CriticVerdict = "approved";
  let comment = "";
  try {
    const { text, usage } = await runAgent({
      systemPrompt: critic.systemPrompt,
      prompt,
      projectId: run.projectId,
      contextQuery: task.description,
    });
    await accrue(task.runId, taskId, usage);
    const parsed = extractJson(text) as { verdict?: string; comment?: string };
    verdict = parsed.verdict === "needs_revision" ? "needs_revision" : "approved";
    comment = (parsed.comment ?? "").toString();
  } catch {
    // Якщо Критик не дав структурованої відповіді — приймаємо результат.
    verdict = "approved";
    comment = "Автоматично прийнято (Критик не дав вердикту).";
  }

  await setTaskCritique(taskId, verdict, comment);

  if (verdict === "approved") {
    await setTaskStatus(taskId, "done");
    await logActivity(task.runId, "critic", "approved result", comment);
    return;
  }

  // needs_revision
  if (task.revisionRound < MAX_REVISION_ROUNDS) {
    await query(
      "UPDATE tasks SET status = 'pending', revision_round = revision_round + 1, updated_at = now() WHERE id = $1",
      [taskId],
    );
    await logActivity(task.runId, "critic", "requested revision", comment);
  } else {
    // Вичерпали кола — приймаємо як є, щоб не зациклитися.
    await setTaskStatus(taskId, "done");
    await logActivity(
      task.runId,
      "critic",
      "accepted after max revisions",
      comment,
    );
  }
}

// ──────────────────────────────── Зведення ───────────────────────────────────

/** Стратег пише підсумкове зведення й переводить прогін на перевірку власнику. */
export async function finalizeRun(runId: number): Promise<void> {
  const run = await getRun(runId);
  if (!run || run.status !== "running") return;

  const strategist = await getAgent("strategist");
  const tasks = await listTasks(runId);
  const done = tasks.filter((t) => t.status === "done" || t.status === "approved");

  let summary = "";
  if (strategist) {
    const block = done
      .map((t) => `### ${t.agentName ?? t.agentSlug}\nЗавдання: ${t.description}\nРезультат:\n${t.result}`)
      .join("\n\n");
    const prompt = `Ціль власника: «${run.goal}»

Команда рою виконала завдання:

${block}

Напиши коротке підсумкове зведення для власника українською (Markdown): що зроблено, з чого складається готовий пакет і що варто перевірити. Без зайвої води.`;
    try {
      const { text, usage } = await runAgent({
        systemPrompt: strategist.systemPrompt,
        prompt,
        projectId: run.projectId,
        contextQuery: run.goal,
      });
      await accrue(runId, null, usage);
      summary = text;
    } catch {
      summary = "";
    }
  }

  if (!summary) {
    summary = `# Підсумок прогону\n\nВиконано завдань: ${done.length}/${tasks.length}.`;
  }

  await setRunSummary(runId, summary);
  await logActivity(runId, "strategist", "wrote summary", "");
  await setRunStatus(runId, "awaiting_review");
  await addEvent(
    "run_review",
    "Прогін завершено — чекає на твою перевірку",
    run.goal,
    runId,
  );
  await notifyOwner(
    "✅ Прогін рою завершено",
    `Ціль: ${run.goal}\nРезультати чекають на вашу перевірку в дашборді.`,
  );
}

// ──────────────────────────────── Помилки ────────────────────────────────────

async function setRunStatusFailed(runId: number, message: string): Promise<void> {
  await query(
    "UPDATE runs SET status = 'failed', error = $2, updated_at = now() WHERE id = $1",
    [runId, message],
  );
  await logActivity(runId, "system", "run failed", message);
  await addEvent("run_failed", "Прогін зупинено через помилку", message, runId);
}
