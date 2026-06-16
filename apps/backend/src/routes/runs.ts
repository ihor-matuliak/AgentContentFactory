import { Router } from "express";
import type {
  AddTaskRequest,
  AnswerQuestionRequest,
  CreateRunRequest,
  ReviewDecisionRequest,
  RunSize,
  SoloTaskRequest,
  UpdateTaskRequest,
  VisualDecisionRequest,
} from "@swarm/shared";
import { isValidImageModel } from "@swarm/shared";
import { query } from "../db.js";
import { addEvent, logActivity } from "../journal.js";
import { notifyOwner } from "../notify.js";
import {
  addTaskToRun,
  answerTaskQuestion,
  bumpRevision,
  createRun,
  deleteTask,
  getRun,
  getRunDetail,
  getTask,
  listReviewQueue,
  listRuns,
  setRunStatus,
  setTaskAssetsStatus,
  setTaskStatus,
  updateTask,
} from "../store.js";
import { draftFromApprovedTask } from "../content.js";
import { approvePlan } from "../agents/orchestrator.js";
import { kickQueue, requeueRun } from "../agents/queue.js";
import { findAgentBySlug } from "../chat.js";
import { getProjectId } from "./projectScope.js";

export const runsRouter = Router();

/** POST /api/runs — створити прогін рою в проєкті. */
runsRouter.post("/", async (req, res) => {
  const projectId = await getProjectId(req);
  if (projectId === null) {
    res.status(400).json({ error: "Потрібен валідний projectId" });
    return;
  }
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
  const imageModel =
    typeof body.imageModel === "string" && isValidImageModel(body.imageModel)
      ? body.imageModel
      : null;

  const run = await createRun(projectId, goal, size, "planning", maxBudgetUsd, imageModel);
  await logActivity(run.id, "owner", "created run", goal);
  await addEvent("run_created", "Створено новий прогін рою", goal, run.id, projectId);
  kickQueue();

  res.status(201).json(run);
});

/**
 * POST /api/runs/solo — пряме (solo) завдання конкретному агенту, оминаючи
 * планування Стратега (Фаза 5). Створює прогін одразу у виконанні з одним
 * завданням для вибраного агента.
 */
runsRouter.post("/solo", async (req, res) => {
  const projectId = await getProjectId(req);
  if (projectId === null) {
    res.status(400).json({ error: "Потрібен валідний projectId" });
    return;
  }
  const body = req.body as Partial<SoloTaskRequest>;
  const goal = typeof body.goal === "string" ? body.goal.trim() : "";
  const agentSlug = typeof body.agentSlug === "string" ? body.agentSlug.trim() : "";
  if (!goal || !agentSlug) {
    res.status(400).json({ error: "Потрібні goal та agentSlug" });
    return;
  }
  const agent = await findAgentBySlug(agentSlug);
  if (!agent) {
    res.status(404).json({ error: "Агента не знайдено" });
    return;
  }
  const maxBudgetUsd =
    typeof body.maxBudgetUsd === "number" && body.maxBudgetUsd > 0
      ? body.maxBudgetUsd
      : null;
  const imageModel =
    typeof body.imageModel === "string" && isValidImageModel(body.imageModel)
      ? body.imageModel
      : null;

  // Прогін одразу у виконанні (без планування) + одне завдання для агента.
  const run = await createRun(projectId, goal, "small", "running", maxBudgetUsd, imageModel);
  await addTaskToRun({ runId: run.id, agentSlug, description: goal });
  await logActivity(run.id, "owner", "solo task", `${agent.name}: ${goal}`);
  await addEvent("run_started", `Пряме завдання: ${agent.name}`, goal, run.id, projectId);
  kickQueue();

  res.status(201).json(run);
});

/** GET /api/runs?projectId=N — список прогонів проєкту з лічильниками. */
runsRouter.get("/", async (req, res) => {
  const projectId = await getProjectId(req);
  if (projectId === null) {
    res.status(400).json({ error: "Потрібен валідний projectId" });
    return;
  }
  res.json(await listRuns(projectId));
});

/** GET /api/runs/review?projectId=N — черга результатів «На перевірці». */
runsRouter.get("/review", async (req, res) => {
  const projectId = await getProjectId(req);
  if (projectId === null) {
    res.status(400).json({ error: "Потрібен валідний projectId" });
    return;
  }
  res.json(await listReviewQueue(projectId));
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
      run.projectId,
    );
    await requeueRun(runId);
    res.json(await getRunDetail(runId));
    return;
  }

  // approve
  await setTaskStatus(taskId, "approved");
  await logActivity(runId, "owner", "approved result", task.description);

  // Замкнута петля: завдання-публікація → автоматична чернетка + контент-план.
  const draft = await draftFromApprovedTask({ ...task, status: "approved" }, run.projectId);
  if (draft) {
    await logActivity(runId, "system", "created draft", draft.title);
    await addEvent(
      "draft_created",
      "Створено чернетку контенту",
      `${draft.title} → контент-план`,
      runId,
      run.projectId,
    );
  }

  const { rows } = await query<{ pending: string }>(
    "SELECT COUNT(*)::int AS pending FROM tasks WHERE run_id = $1 AND status <> 'approved' AND status <> 'failed'",
    [runId],
  );
  if (Number(rows[0]?.pending ?? 0) === 0) {
    await setRunStatus(runId, "completed");
    await logActivity(runId, "owner", "approved run", "");
    await addEvent("run_completed", "Прогін схвалено та завершено", run.goal, runId, run.projectId);
    await notifyOwner("🎉 Прогін рою завершено та схвалено", `Ціль: ${run.goal}`);
  }

  res.json(await getRunDetail(runId));
});

/**
 * POST /api/runs/:id/tasks/:taskId/visual — рішення власника на гейті схвалення
 * згенерованого візуалу ПОСЕРЕД прогону: «approve» (рій рухається далі) або
 * «rework» (Дизайнер перегенеровує з коментарем).
 */
runsRouter.post("/:id/tasks/:taskId/visual", async (req, res) => {
  const runId = Number(req.params.id);
  const taskId = Number(req.params.taskId);
  const body = req.body as Partial<VisualDecisionRequest>;

  const run = await getRun(runId);
  const task = await getTask(taskId);
  if (!run || !task || task.runId !== runId) {
    res.status(404).json({ error: "Прогін або завдання не знайдено" });
    return;
  }
  if (task.status !== "awaiting_approval") {
    res.status(409).json({ error: "Завдання не на гейті схвалення візуалу" });
    return;
  }

  if (body.decision === "rework") {
    const comment = (body.comment ?? "").toString().trim();
    await setTaskAssetsStatus(taskId, "rejected");
    await bumpRevision(taskId, comment); // → pending, revision_round++, ownerFeedback
    await logActivity(runId, "owner", "reworked visual", comment);
    await addEvent(
      "revision_requested",
      "Візуал відправлено на доопрацювання",
      comment || run.goal,
      runId,
      run.projectId,
    );
    kickQueue(); // Дизайнер перегенерує → гейт знову
    res.json(await getRunDetail(runId));
    return;
  }

  // approve → зображення схвалено, рій рухається далі
  await setTaskAssetsStatus(taskId, "approved");
  await setTaskStatus(taskId, "approved");
  await logActivity(runId, "owner", "approved visual", task.description);

  // Замкнута петля: схвалений візуал → чернетка + контент-план (ідемпотентно).
  const draft = await draftFromApprovedTask({ ...task, status: "approved" }, run.projectId);
  if (draft) {
    await logActivity(runId, "system", "created draft", draft.title);
    await addEvent(
      "draft_created",
      "Створено чернетку контенту",
      `${draft.title} → контент-план`,
      runId,
      run.projectId,
    );
  }

  kickQueue(); // продовжуємо прогін (downstream-завдання, фіналізація)
  res.json(await getRunDetail(runId));
});

/** POST /api/runs/:id/repeat — повторити прогін (нова ціль = та сама). */
runsRouter.post("/:id/repeat", async (req, res) => {
  const src = await getRun(Number(req.params.id));
  if (!src) {
    res.status(404).json({ error: "Прогін не знайдено" });
    return;
  }
  const run = await createRun(src.projectId, src.goal, src.size, "planning", src.maxBudgetUsd, src.imageModel);
  await logActivity(run.id, "owner", "repeated run", `копія прогону #${src.id}`);
  await addEvent("run_created", "Прогін повторено", src.goal, run.id, src.projectId);
  kickQueue();
  res.status(201).json(run);
});

/**
 * POST /api/runs/:id/tasks/:taskId/answer — власник відповідає на уточнення
 * виконавця; завдання повертається в чергу.
 */
runsRouter.post("/:id/tasks/:taskId/answer", async (req, res) => {
  const runId = Number(req.params.id);
  const taskId = Number(req.params.taskId);
  const body = req.body as Partial<AnswerQuestionRequest>;
  const answer = typeof body.answer === "string" ? body.answer.trim() : "";
  if (!answer) {
    res.status(400).json({ error: "Поле answer обовʼязкове" });
    return;
  }
  const task = await getTask(taskId);
  if (!task || task.runId !== runId) {
    res.status(404).json({ error: "Завдання не знайдено" });
    return;
  }
  await answerTaskQuestion(taskId, answer);
  await logActivity(runId, "owner", "answered question", answer);
  await requeueRun(runId);
  res.json(await getRunDetail(runId));
});

/** POST /api/runs/:id/tasks — додати завдання у план (редагування плану). */
runsRouter.post("/:id/tasks", async (req, res) => {
  const runId = Number(req.params.id);
  const run = await getRun(runId);
  if (!run) {
    res.status(404).json({ error: "Прогін не знайдено" });
    return;
  }
  const body = req.body as Partial<AddTaskRequest>;
  const description = typeof body.description === "string" ? body.description.trim() : "";
  const agentSlug = typeof body.agentSlug === "string" ? body.agentSlug.trim() : "";
  if (!description || !agentSlug) {
    res.status(400).json({ error: "Потрібні description та agentSlug" });
    return;
  }
  await addTaskToRun({
    runId,
    agentSlug,
    description,
    dependsOn: Array.isArray(body.dependsOn) ? body.dependsOn : [],
  });
  await logActivity(runId, "owner", "added task", description);
  res.status(201).json(await getRunDetail(runId));
});

/** PATCH /api/runs/:id/tasks/:taskId — правка/перепризначення/статус завдання. */
runsRouter.patch("/:id/tasks/:taskId", async (req, res) => {
  const runId = Number(req.params.id);
  const taskId = Number(req.params.taskId);
  const task = await getTask(taskId);
  const run = await getRun(runId);
  if (!task || !run || task.runId !== runId) {
    res.status(404).json({ error: "Завдання не знайдено" });
    return;
  }
  const body = req.body as Partial<UpdateTaskRequest>;
  const patch: UpdateTaskRequest = {};
  if (typeof body.description === "string") patch.description = body.description.trim();
  if (typeof body.agentSlug === "string") patch.agentSlug = body.agentSlug.trim();
  if (typeof body.status === "string") patch.status = body.status;

  const updated = await updateTask(taskId, patch);
  await logActivity(runId, "owner", "edited task", patch.status ?? patch.description ?? "");

  if (patch.status === "approved" && updated) {
    const draft = await draftFromApprovedTask(updated, run.projectId);
    if (draft) {
      await logActivity(runId, "system", "created draft", draft.title);
      await addEvent("draft_created", "Створено чернетку контенту", draft.title, runId, run.projectId);
    }
  }
  res.json(await getRunDetail(runId));
});

/** DELETE /api/runs/:id/tasks/:taskId — видалити завдання з плану. */
runsRouter.delete("/:id/tasks/:taskId", async (req, res) => {
  const runId = Number(req.params.id);
  const taskId = Number(req.params.taskId);
  const task = await getTask(taskId);
  if (!task || task.runId !== runId) {
    res.status(404).json({ error: "Завдання не знайдено" });
    return;
  }
  await deleteTask(taskId);
  await logActivity(runId, "owner", "deleted task", task.description);
  res.json(await getRunDetail(runId));
});
