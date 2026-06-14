import { Router } from "express";
import type {
  CreateRunRequest,
  ReviewDecisionRequest,
  RunSize,
} from "@swarm/shared";
import { query } from "../db.js";
import { addEvent, logActivity } from "../journal.js";
import { notifyOwner } from "../notify.js";
import {
  bumpRevision,
  createRun,
  getRun,
  getRunDetail,
  getTask,
  listReviewQueue,
  listRuns,
  setRunStatus,
  setTaskStatus,
} from "../store.js";
import { approvePlan } from "../agents/orchestrator.js";
import { kickQueue, requeueRun } from "../agents/queue.js";

export const runsRouter = Router();

/** POST /api/runs — створити прогін рою. */
runsRouter.post("/", async (req, res) => {
  const body = req.body as Partial<CreateRunRequest>;
  const goal = typeof body.goal === "string" ? body.goal.trim() : "";
  if (!goal) {
    res.status(400).json({ error: "Поле goal обовʼязкове" });
    return;
  }
  const size: RunSize = body.size === "large" ? "large" : "small";
  const maxBudgetUsd =
    typeof body.maxBudgetUsd === "number" && body.maxBudgetUsd > 0
      ? body.maxBudgetUsd
      : null;

  const run = await createRun(goal, size, "planning", maxBudgetUsd);
  await logActivity(run.id, "owner", "created run", goal);
  await addEvent("run_created", "Створено новий прогін рою", goal, run.id);
  kickQueue();

  res.status(201).json(run);
});

/** GET /api/runs — список прогонів із лічильниками завдань. */
runsRouter.get("/", async (_req, res) => {
  res.json(await listRuns());
});

/** GET /api/runs/review — черга результатів «На перевірці». */
runsRouter.get("/review", async (_req, res) => {
  res.json(await listReviewQueue());
});

/** GET /api/runs/:id — повна картина прогону. */
runsRouter.get("/:id", async (req, res) => {
  const detail = await getRunDetail(Number(req.params.id));
  if (!detail) {
    res.status(404).json({ error: "Прогін не знайдено" });
    return;
  }
  res.json(detail);
});

/** POST /api/runs/:id/approve — власник схвалює план великого прогону. */
runsRouter.post("/:id/approve", async (req, res) => {
  const ok = await approvePlan(Number(req.params.id));
  if (!ok) {
    res.status(409).json({ error: "Прогін не очікує схвалення плану" });
    return;
  }
  kickQueue();
  res.json(await getRunDetail(Number(req.params.id)));
});

/**
 * POST /api/runs/:id/tasks/:taskId/review — рішення власника щодо результату:
 * «approve» (схвалити) або «rework» (на доопрацювання з коментарем).
 */
runsRouter.post("/:id/tasks/:taskId/review", async (req, res) => {
  const runId = Number(req.params.id);
  const taskId = Number(req.params.taskId);
  const body = req.body as Partial<ReviewDecisionRequest>;

  const run = await getRun(runId);
  const task = await getTask(taskId);
  if (!run || !task || task.runId !== runId) {
    res.status(404).json({ error: "Прогін або завдання не знайдено" });
    return;
  }
  if (run.status !== "awaiting_review") {
    res.status(409).json({ error: "Прогін не на перевірці" });
    return;
  }

  if (body.decision === "rework") {
    const comment = (body.comment ?? "").toString().trim();
    await bumpRevision(taskId, comment);
    await logActivity(runId, "owner", "requested revision", comment);
    await addEvent(
      "revision_requested",
      "Результат відправлено на доопрацювання",
      comment || run.goal,
      runId,
    );
    await requeueRun(runId); // status → running, черга підхопить
    res.json(await getRunDetail(runId));
    return;
  }

  // approve
  await setTaskStatus(taskId, "approved");
  await logActivity(runId, "owner", "approved result", task.description);

  // Чи всі завдання прогону схвалені?
  const { rows } = await query<{ pending: string }>(
    "SELECT COUNT(*)::int AS pending FROM tasks WHERE run_id = $1 AND status <> 'approved' AND status <> 'failed'",
    [runId],
  );
  if (Number(rows[0]?.pending ?? 0) === 0) {
    await setRunStatus(runId, "completed");
    await logActivity(runId, "owner", "approved run", "");
    await addEvent("run_completed", "Прогін схвалено та завершено", run.goal, runId);
    await notifyOwner("🎉 Прогін рою завершено та схвалено", `Ціль: ${run.goal}`);
  }

  res.json(await getRunDetail(runId));
});
