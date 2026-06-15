import { Router } from "express";
import type { CreateIdeaRequest } from "@swarm/shared";
import { addEvent, logActivity } from "../journal.js";
import { createRun } from "../store.js";
import { kickQueue } from "../agents/queue.js";
import { createIdea, getIdea, listIdeas, markIdeaConverted, setIdeaStatus } from "../ideas.js";
import { defaultProjectId, getProjectById } from "../projects.js";

export const ideasRouter = Router();

/** GET /api/ideas — усі ідеї інбокса (крос-проєктно). */
ideasRouter.get("/", async (_req, res) => {
  res.json(await listIdeas());
});

/** POST /api/ideas — додати ідею в інбокс. */
ideasRouter.post("/", async (req, res) => {
  const body = req.body as Partial<CreateIdeaRequest>;
  const text = typeof body.body === "string" ? body.body.trim() : "";
  if (!text) {
    res.status(400).json({ error: "Поле body обовʼязкове" });
    return;
  }
  const idea = await createIdea({
    body: text,
    projectId: typeof body.projectId === "number" ? body.projectId : null,
    source: body.source === "telegram" ? "telegram" : "dashboard",
  });
  res.status(201).json(idea);
});

/** POST /api/ideas/:id/convert — перетворити ідею на прогін рою. */
ideasRouter.post("/:id/convert", async (req, res) => {
  const idea = await getIdea(Number(req.params.id));
  if (!idea) {
    res.status(404).json({ error: "Ідею не знайдено" });
    return;
  }
  // Проєкт: ідеї або з тіла запиту, або типовий (демо).
  const bodyProject = Number((req.body as { projectId?: unknown })?.projectId);
  let projectId = idea.projectId;
  if (Number.isInteger(bodyProject) && bodyProject > 0) {
    if (await getProjectById(bodyProject)) projectId = bodyProject;
  }
  if (!projectId) projectId = await defaultProjectId();
  if (!projectId) {
    res.status(400).json({ error: "Немає проєкту для прогону" });
    return;
  }

  const run = await createRun(projectId, idea.body, "small", "planning", null);
  await markIdeaConverted(idea.id, run.id);
  await logActivity(run.id, "owner", "from idea", idea.body);
  await addEvent("run_created", "Ідею перетворено на прогін", idea.body, run.id, projectId);
  kickQueue();
  res.status(201).json(run);
});

/** POST /api/ideas/:id/archive — заархівувати ідею. */
ideasRouter.post("/:id/archive", async (req, res) => {
  await setIdeaStatus(Number(req.params.id), "archived");
  res.json({ ok: true });
});
