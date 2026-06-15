import { Router } from "express";
import type { CreateProjectRequest } from "@swarm/shared";
import { createProject, getProjectBySlug, listProjects } from "../projects.js";

export const projectsRouter = Router();

/** GET /api/projects — усі проєкти з короткою статистикою. */
projectsRouter.get("/", async (_req, res) => {
  res.json(await listProjects());
});

/** GET /api/projects/:slug — один проєкт за slug. */
projectsRouter.get("/:slug", async (req, res) => {
  const project = await getProjectBySlug(req.params.slug);
  if (!project) {
    res.status(404).json({ error: "Проєкт не знайдено" });
    return;
  }
  res.json(project);
});

/** POST /api/projects — створити проєкт. */
projectsRouter.post("/", async (req, res) => {
  const body = req.body as Partial<CreateProjectRequest>;
  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name) {
    res.status(400).json({ error: "Поле name обовʼязкове" });
    return;
  }
  const project = await createProject({
    name,
    slug: typeof body.slug === "string" ? body.slug : undefined,
    description: typeof body.description === "string" ? body.description : undefined,
  });
  res.status(201).json(project);
});
