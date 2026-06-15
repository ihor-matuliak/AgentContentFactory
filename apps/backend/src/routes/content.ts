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
import { getProjectId } from "./projectScope.js";

export const contentRouter = Router();

const PLATFORMS: Platform[] = ["youtube", "telegram", "instagram", "other"];
function asPlatform(v: unknown): Platform {
  return PLATFORMS.includes(v as Platform) ? (v as Platform) : "other";
}

async function requireProject(
  req: import("express").Request,
  res: import("express").Response,
): Promise<number | null> {
  const projectId = await getProjectId(req);
  if (projectId === null) {
    res.status(400).json({ error: "Потрібен валідний projectId" });
    return null;
  }
  return projectId;
}

/** GET /api/content/board?projectId=N — усі завдання рою проєкту. */
contentRouter.get("/board", async (req, res) => {
  const projectId = await requireProject(req, res);
  if (projectId === null) return;
  res.json(await listBoardTasks(projectId));
});

/** GET /api/content/drafts?projectId=N — чернетки контенту проєкту. */
contentRouter.get("/drafts", async (req, res) => {
  const projectId = await requireProject(req, res);
  if (projectId === null) return;
  res.json(await listDrafts(projectId));
});

/** GET /api/content/plan?projectId=N — контент-план проєкту. */
contentRouter.get("/plan", async (req, res) => {
  const projectId = await requireProject(req, res);
  if (projectId === null) return;
  res.json(await listPlan(projectId));
});

/** POST /api/content/plan?projectId=N — додати запис у контент-план вручну. */
contentRouter.post("/plan", async (req, res) => {
  const projectId = await requireProject(req, res);
  if (projectId === null) return;
  const b = req.body as Record<string, unknown>;
  const title = typeof b.title === "string" ? b.title.trim() : "";
  if (!title) {
    res.status(400).json({ error: "Поле title обовʼязкове" });
    return;
  }
  const item = await createPlanItem({
    projectId,
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
