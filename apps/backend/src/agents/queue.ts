import { query } from "../db.js";
import { addEvent, logActivity } from "../journal.js";
import {
  isOverBudget,
  listRunningRunIds,
  nextRunnableTask,
  runHasBlockingTask,
  setRunStatus,
} from "../store.js";
import { executeTask, finalizeRun, planRun } from "./orchestrator.js";

/**
 * Фонова черга прогонів рою.
 *
 * Виконує роботу по одному кроку за раз (послідовно), не блокуючи дашборд:
 * виклики Claude — це I/O, тож event loop Express лишається вільним.
 * Джерело правди — база, тож після перезапуску бекенду незавершені прогони
 * підхоплюються (див. `resumeQueue`).
 */

let running = false;

/** Будить чергу: якщо вона не працює — запускає цикл обробки. */
export function kickQueue(): void {
  if (running) return;
  running = true;
  void loop();
}

async function loop(): Promise<void> {
  try {
    // Поки є робота — робимо по одному кроку.

    while (await step()) {
      /* крутимося, доки step() знаходить роботу */
    }
  } catch (err) {
    console.error("Помилка у черзі прогонів:", err);
  } finally {
    running = false;
    // Можливо, робота зʼявилася під час останнього кроку — перевіримо ще раз.
    if (await hasWork()) kickQueue();
  }
}

/** Один крок роботи. Повертає true, якщо щось зробив. */
async function step(): Promise<boolean> {
  // 1) Прогони, що чекають на планування.
  const planning = await firstPlanningRunId();
  if (planning !== null) {
    await planRun(planning);
    return true;
  }

  // 2) Прогони у виконанні.
  for (const runId of await listRunningRunIds()) {
    if (await isOverBudget(runId)) {
      await query(
        "UPDATE runs SET status = 'failed', error = 'Бюджет вичерпано', updated_at = now() WHERE id = $1",
        [runId],
      );
      await logActivity(runId, "system", "budget reached", "");
      await addEvent("run_failed", "Прогін зупинено: вичерпано бюджет", "", runId);
      return true;
    }

    const task = await nextRunnableTask(runId);
    if (task) {
      await executeTask(task.id);
      return true;
    }
    // Є завдання, що чекає на відповідь власника (або ще в роботі) → пауза,
    // не фіналізуємо прогін. Переходимо до наступного прогону.
    if (await runHasBlockingTask(runId)) continue;
    // Немає завдань, готових до виконання → прогін відпрацьовано.
    await finalizeRun(runId);
    return true;
  }

  return false;
}

async function firstPlanningRunId(): Promise<number | null> {
  const { rows } = await query<{ id: number }>(
    "SELECT id FROM runs WHERE status = 'planning' ORDER BY id ASC LIMIT 1",
  );
  return rows[0]?.id ?? null;
}

async function hasWork(): Promise<boolean> {
  const { rows } = await query<{ n: number }>(
    "SELECT COUNT(*)::int AS n FROM runs WHERE status IN ('planning', 'running')",
  );
  return Number(rows[0]?.n ?? 0) > 0;
}

/**
 * Підхоплює незавершені прогони після перезапуску бекенду:
 * завдання, що зависли в `in_progress`, повертаються в чергу (`pending`),
 * після чого черга прокидається.
 */
export async function resumeQueue(): Promise<void> {
  const { rowCount } = await query(
    "UPDATE tasks SET status = 'pending', updated_at = now() WHERE status = 'in_progress'",
  );
  const runIds = await listRunningRunIds();
  if (rowCount && rowCount > 0 && runIds.length > 0) {
    for (const id of runIds) {
      await logActivity(id, "system", "resumed after restart", `${rowCount} завдань(ня) у черзі`);
    }
    console.log(`↻ Відновлено ${rowCount} незавершених завдань у ${runIds.length} прогоні(ах).`);
  }
  // Прогони у 'planning'/'running' будуть оброблені циклом.
  void ensureStarted();
}

async function ensureStarted(): Promise<void> {
  if (await hasWork()) kickQueue();
}

/** Перезапускає завдання прогону на доопрацювання (виклик з маршруту review). */
export async function requeueRun(runId: number): Promise<void> {
  await setRunStatus(runId, "running");
  kickQueue();
}
