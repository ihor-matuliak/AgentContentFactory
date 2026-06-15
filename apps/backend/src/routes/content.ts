import { Router } from "express";
import type { ContentPlanStatus, Platform } from "@swarm/shared";
import {
  createPlanItem,
  deletePlanItem,
  listDrafts,
  listPlan,
  updatePlanItem,
} from "../content.js";
import { listBoardTasks } from "../store.js";

export const contentRouter = Router();

const PLATFORMS: Platform[] = ["youtube", "telegram", "instagram", "other"];
function asPlatform(v: unknown): Platform {
  return PLATFORMS.includes(v as Platform) ? (v as Platform) : "other";
}

/** GET /api/content/board — усі завдання рою для дошки «Задачі». */
contentRouter.get("/board", async (_req, res) => {
  res.json(await listBoardTasks());
});

/** GET /api/content/drafts — усі чернетки контенту. */
contentRouter.get("/drafts", async (_req, res) => {
  res.json(await listDrafts());
});

/** GET /api/content/plan — контент-план (для календаря). */
contentRouter.get("/plan", async (_req, res) => {
  res.json(await listPlan());
});

/** POST /api/content/plan — додати запис у контент-план вручну. */
contentRouter.post("/plan", async (req, res) => {
  const b = req.body as Record<string, unknown>;
  const title = typeof b.title === "string" ? b.title.trim() : "";
  if (!title) {
    res.status(400).json({ error: "Поле title обовʼязкове" });
    return;
  }
  const item = await createPlanItem({
    draftId: typeof b.draftId === "number" ? b.draftId : null,
    runId: typeof b.runId === "number" ? b.runId : null,
    platform: asPlatform(b.platform),
    title,
    notes: typeof b.notes === "string" ? b.notes : "",
    scheduledFor: typeof b.scheduledFor === "string" ? b.scheduledFor : null,
  });
  res.status(201).json(item);
});

/** PATCH /api/content/plan/:id — оновити запис плану (дата, статус, тощо). */
contentRouter.patch("/plan/:id", async (req, res) => {
  const b = req.body as Record<string, unknown>;
  const patch: Parameters<typeof updatePlanItem>[1] = {};
  if (typeof b.title === "string") patch.title = b.title;
  if (typeof b.notes === "string") patch.notes = b.notes;
  if (b.platform !== undefined) patch.platform = asPlatform(b.platform);
  if (b.scheduledFor === null || typeof b.scheduledFor === "string")
    patch.scheduledFor = b.scheduledFor as string | null;
  if (b.status === "planned" || b.status === "published")
    patch.status = b.status as ContentPlanStatus;
  const item = await updatePlanItem(Number(req.params.id), patch);
  if (!item) {
    res.status(404).json({ error: "Запис плану не знайдено" });
    return;
  }
  res.json(item);
});

/** DELETE /api/content/plan/:id — видалити запис плану. */
contentRouter.delete("/plan/:id", async (req, res) => {
  await deletePlanItem(Number(req.params.id));
  res.json({ ok: true });
});
