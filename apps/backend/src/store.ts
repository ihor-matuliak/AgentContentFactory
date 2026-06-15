import type {
  BoardTask,
  CriticVerdict,
  ReviewItem,
  Run,
  RunDetail,
  RunSize,
  RunStatus,
  RunSummary,
  RunTask,
  TaskStatus,
} from "@swarm/shared";
import { query } from "./db.js";
import { mapActivity } from "./journal.js";

// ───────────────────────── Рядки таблиць (snake_case) ─────────────────────────

interface RunRow {
  id: number;
  goal: string;
  status: string;
  size: string;
  summary: string;
  error: string;
  input_tokens: string;
  output_tokens: string;
  cost_usd: string;
  max_budget_usd: string | null;
  created_at: Date;
  updated_at: Date;
}

interface TaskRow {
  id: number;
  run_id: number;
  agent_slug: string;
  description: string;
  status: string;
  result: string;
  critic_verdict: string;
  critic_comment: string;
  owner_feedback: string;
  depends_on: number[];
  revision_round: number;
  sort_order: number;
  input_tokens: string;
  output_tokens: string;
  cost_usd: string;
  question: string;
  answer: string;
  created_at: Date;
  updated_at: Date;
  agent_name?: string;
}

// ──────────────────────────────── Мапери ─────────────────────────────────────

function mapRun(row: RunRow): Run {
  return {
    id: row.id,
    goal: row.goal,
    status: row.status as RunStatus,
    size: row.size as RunSize,
    summary: row.summary,
    error: row.error,
    inputTokens: Number(row.input_tokens),
    outputTokens: Number(row.output_tokens),
    costUsd: Number(row.cost_usd),
    maxBudgetUsd: row.max_budget_usd === null ? null : Number(row.max_budget_usd),
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

export function mapTask(row: TaskRow): RunTask {
  return {
    id: row.id,
    runId: row.run_id,
    agentSlug: row.agent_slug,
    agentName: row.agent_name,
    description: row.description,
    status: row.status as TaskStatus,
    result: row.result,
    criticVerdict: row.critic_verdict as CriticVerdict,
    criticComment: row.critic_comment,
    ownerFeedback: row.owner_feedback,
    dependsOn: row.depends_on ?? [],
    revisionRound: row.revision_round,
    sortOrder: row.sort_order,
    inputTokens: Number(row.input_tokens),
    outputTokens: Number(row.output_tokens),
    costUsd: Number(row.cost_usd),
    question: row.question,
    answer: row.answer,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

// ──────────────────────────────── Прогони ────────────────────────────────────

export async function createRun(
  goal: string,
  size: RunSize,
  status: RunStatus,
  maxBudgetUsd: number | null,
): Promise<Run> {
  const { rows } = await query<RunRow>(
    `INSERT INTO runs (goal, size, status, max_budget_usd)
     VALUES ($1, $2, $3, $4) RETURNING *`,
    [goal, size, status, maxBudgetUsd],
  );
  return mapRun(rows[0]);
}

export async function getRun(id: number): Promise<Run | null> {
  const { rows } = await query<RunRow>("SELECT * FROM runs WHERE id = $1", [id]);
  return rows[0] ? mapRun(rows[0]) : null;
}

export async function listRuns(): Promise<RunSummary[]> {
  const { rows } = await query<RunRow & { total_tasks: string; done_tasks: string }>(
    `SELECT r.*,
            COUNT(t.id)                              AS total_tasks,
            COUNT(t.id) FILTER (WHERE t.status = 'done') AS done_tasks
     FROM runs r
     LEFT JOIN tasks t ON t.run_id = r.id
     GROUP BY r.id
     ORDER BY r.id DESC`,
  );
  return rows.map((row) => ({
    ...mapRun(row),
    totalTasks: Number(row.total_tasks),
    doneTasks: Number(row.done_tasks),
  }));
}

export async function setRunStatus(id: number, status: RunStatus): Promise<void> {
  await query("UPDATE runs SET status = $2, updated_at = now() WHERE id = $1", [
    id,
    status,
  ]);
}

export async function setRunSummary(id: number, summary: string): Promise<void> {
  await query("UPDATE runs SET summary = $2, updated_at = now() WHERE id = $1", [
    id,
    summary,
  ]);
}

export async function setRunError(id: number, error: string): Promise<void> {
  await query(
    "UPDATE runs SET status = 'failed', error = $2, updated_at = now() WHERE id = $1",
    [id, error],
  );
}

/** Додає до лічильників витрат прогону вартість одного виклику. */
export async function addRunUsage(
  id: number,
  inputTokens: number,
  outputTokens: number,
  costUsd: number,
): Promise<void> {
  await query(
    `UPDATE runs
     SET input_tokens = input_tokens + $2,
         output_tokens = output_tokens + $3,
         cost_usd = cost_usd + $4,
         updated_at = now()
     WHERE id = $1`,
    [id, inputTokens, outputTokens, costUsd],
  );
}

/** Чи перевищено бюджет прогону (якщо його задано). */
export async function isOverBudget(id: number): Promise<boolean> {
  const { rows } = await query<{ over: boolean }>(
    `SELECT (max_budget_usd IS NOT NULL AND cost_usd >= max_budget_usd) AS over
     FROM runs WHERE id = $1`,
    [id],
  );
  return rows[0]?.over ?? false;
}

// ──────────────────────────────── Завдання ───────────────────────────────────

export async function createTask(input: {
  runId: number;
  agentSlug: string;
  description: string;
  sortOrder: number;
  dependsOn?: number[];
}): Promise<RunTask> {
  const { rows } = await query<TaskRow>(
    `INSERT INTO tasks (run_id, agent_slug, description, sort_order, depends_on)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [
      input.runId,
      input.agentSlug,
      input.description,
      input.sortOrder,
      input.dependsOn ?? [],
    ],
  );
  return mapTask(rows[0]);
}

export async function getTask(id: number): Promise<RunTask | null> {
  const { rows } = await query<TaskRow>("SELECT * FROM tasks WHERE id = $1", [id]);
  return rows[0] ? mapTask(rows[0]) : null;
}

export async function listTasks(runId: number): Promise<RunTask[]> {
  const { rows } = await query<TaskRow>(
    `SELECT t.*, a.name AS agent_name
     FROM tasks t
     LEFT JOIN agents a ON a.slug = t.agent_slug
     WHERE t.run_id = $1
     ORDER BY t.sort_order ASC, t.id ASC`,
    [runId],
  );
  return rows.map(mapTask);
}

export async function setTaskStatus(id: number, status: TaskStatus): Promise<void> {
  await query("UPDATE tasks SET status = $2, updated_at = now() WHERE id = $1", [
    id,
    status,
  ]);
}

export async function setTaskResult(id: number, result: string): Promise<void> {
  await query("UPDATE tasks SET result = $2, updated_at = now() WHERE id = $1", [
    id,
    result,
  ]);
}

export async function setTaskCritique(
  id: number,
  verdict: CriticVerdict,
  comment: string,
): Promise<void> {
  await query(
    `UPDATE tasks SET critic_verdict = $2, critic_comment = $3, updated_at = now()
     WHERE id = $1`,
    [id, verdict, comment],
  );
}

/** Відправляє завдання на нове коло доопрацювання. */
export async function bumpRevision(id: number, ownerFeedback?: string): Promise<void> {
  await query(
    `UPDATE tasks
     SET status = 'pending',
         revision_round = revision_round + 1,
         owner_feedback = COALESCE($2, owner_feedback),
         updated_at = now()
     WHERE id = $1`,
    [id, ownerFeedback ?? null],
  );
}

export async function addTaskUsage(
  id: number,
  inputTokens: number,
  outputTokens: number,
  costUsd: number,
): Promise<void> {
  await query(
    `UPDATE tasks
     SET input_tokens = input_tokens + $2,
         output_tokens = output_tokens + $3,
         cost_usd = cost_usd + $4,
         updated_at = now()
     WHERE id = $1`,
    [id, inputTokens, outputTokens, costUsd],
  );
}

// ──────────────────────── Запити для рушія/черги/UI ──────────────────────────

export async function getRunDetail(id: number): Promise<RunDetail | null> {
  const run = await getRun(id);
  if (!run) return null;
  const tasks = await listTasks(id);
  const { rows } = await query<{
    id: number;
    run_id: number;
    actor: string;
    action: string;
    detail: string;
    created_at: Date;
  }>("SELECT * FROM activity_log WHERE run_id = $1 ORDER BY id ASC LIMIT 200", [id]);
  return { run, tasks, activity: rows.map(mapActivity) };
}

/** Прогони, які черга має активно вести (виконання). */
export async function listRunningRunIds(): Promise<number[]> {
  const { rows } = await query<{ id: number }>(
    "SELECT id FROM runs WHERE status = 'running' ORDER BY id ASC",
  );
  return rows.map((r) => r.id);
}

/** Завдання прогону, готове до виконання (залежності виконані). */
export async function nextRunnableTask(runId: number): Promise<RunTask | null> {
  const tasks = await listTasks(runId);
  const doneIds = new Set(
    tasks.filter((t) => t.status === "done" || t.status === "approved").map((t) => t.id),
  );
  for (const t of tasks) {
    if (t.status !== "pending") continue;
    if (t.dependsOn.every((dep) => doneIds.has(dep))) return t;
  }
  return null;
}

/** Чи всі завдання прогону завершені (done) або провалені. */
export async function runTasksSettled(runId: number): Promise<boolean> {
  const tasks = await listTasks(runId);
  if (tasks.length === 0) return false;
  return tasks.every((t) => t.status === "done" || t.status === "failed");
}

/** Черга «На перевірці»: результати готових завдань у прогонах awaiting_review. */
export async function listReviewQueue(): Promise<ReviewItem[]> {
  const { rows } = await query<TaskRow>(
    `SELECT t.*, a.name AS agent_name
     FROM tasks t
     JOIN runs r ON r.id = t.run_id
     LEFT JOIN agents a ON a.slug = t.agent_slug
     WHERE r.status = 'awaiting_review' AND t.status = 'done'
     ORDER BY r.id DESC, t.sort_order ASC`,
  );
  const runCache = new Map<number, Run>();
  const items: ReviewItem[] = [];
  for (const row of rows) {
    let run = runCache.get(row.run_id);
    if (!run) {
      const fetched = await getRun(row.run_id);
      if (!fetched) continue;
      run = fetched;
      runCache.set(row.run_id, run);
    }
    items.push({ task: mapTask(row), run });
  }
  return items;
}

// ────────────────────── Фаза 4: уточнення, правки, дошка ──────────────────────

/** Виставляє уточнювальне питання виконавця й переводить завдання в очікування. */
export async function setTaskQuestion(id: number, question: string): Promise<void> {
  await query(
    `UPDATE tasks SET status = 'waiting_question', question = $2, updated_at = now()
     WHERE id = $1`,
    [id, question],
  );
}

/** Власник відповів на уточнення → завдання повертається в чергу. */
export async function answerTaskQuestion(id: number, answer: string): Promise<void> {
  await query(
    `UPDATE tasks SET status = 'pending', answer = $2, updated_at = now()
     WHERE id = $1`,
    [id, answer],
  );
}

/** Чи має прогін завдання, що блокує фіналізацію (працює або чекає на відповідь). */
export async function runHasBlockingTask(runId: number): Promise<boolean> {
  const { rows } = await query<{ n: number }>(
    `SELECT COUNT(*)::int AS n FROM tasks
     WHERE run_id = $1 AND status IN ('in_progress', 'waiting_question')`,
    [runId],
  );
  return Number(rows[0]?.n ?? 0) > 0;
}

/** Правка завдання власником (опис, виконавець, статус). */
export async function updateTask(
  id: number,
  patch: { description?: string; agentSlug?: string; status?: TaskStatus },
): Promise<RunTask | null> {
  const sets: string[] = [];
  const params: unknown[] = [id];
  if (patch.description !== undefined) {
    params.push(patch.description);
    sets.push(`description = $${params.length}`);
  }
  if (patch.agentSlug !== undefined) {
    params.push(patch.agentSlug);
    sets.push(`agent_slug = $${params.length}`);
  }
  if (patch.status !== undefined) {
    params.push(patch.status);
    sets.push(`status = $${params.length}`);
  }
  if (sets.length === 0) return getTask(id);
  await query(
    `UPDATE tasks SET ${sets.join(", ")}, updated_at = now() WHERE id = $1`,
    params,
  );
  return getTask(id);
}

export async function deleteTask(id: number): Promise<void> {
  await query("DELETE FROM tasks WHERE id = $1", [id]);
}

/** Додає завдання у план прогону наступним за порядком. */
export async function addTaskToRun(input: {
  runId: number;
  agentSlug: string;
  description: string;
  dependsOn?: number[];
}): Promise<RunTask> {
  const { rows: ord } = await query<{ next: number }>(
    "SELECT COALESCE(MAX(sort_order) + 1, 0) AS next FROM tasks WHERE run_id = $1",
    [input.runId],
  );
  const { rows } = await query<TaskRow>(
    `INSERT INTO tasks (run_id, agent_slug, description, sort_order, depends_on)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [
      input.runId,
      input.agentSlug,
      input.description,
      Number(ord[0]?.next ?? 0),
      input.dependsOn ?? [],
    ],
  );
  return mapTask(rows[0]);
}

/** Усі завдання рою для дошки «Задачі» (із ціллю та статусом прогону). */
export async function listBoardTasks(): Promise<BoardTask[]> {
  const { rows } = await query<
    TaskRow & { run_goal: string; run_status: string }
  >(
    `SELECT t.*, a.name AS agent_name, r.goal AS run_goal, r.status AS run_status
     FROM tasks t
     JOIN runs r ON r.id = t.run_id
     LEFT JOIN agents a ON a.slug = t.agent_slug
     ORDER BY t.updated_at DESC, t.id DESC`,
  );
  return rows.map((row) => ({
    ...mapTask(row),
    runGoal: row.run_goal,
    runStatus: row.run_status as BoardTask["runStatus"],
  }));
}
