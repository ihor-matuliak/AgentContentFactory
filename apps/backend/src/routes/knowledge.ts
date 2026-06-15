import { Router } from "express";
import type { IngestRequest } from "@swarm/shared";
import {
  deleteSource,
  ingestDir,
  ingestText,
  listSources,
  searchKnowledge,
} from "../knowledge.js";
import { getProjectId } from "./projectScope.js";

export const knowledgeRouter = Router();

/** GET /api/knowledge?projectId=N — джерела знань проєкту. */
knowledgeRouter.get("/", async (req, res) => {
  const projectId = await getProjectId(req);
  if (projectId === null) {
    res.status(400).json({ error: "Потрібен валідний projectId" });
    return;
  }
  res.json(await listSources(projectId));
});

/** GET /api/knowledge/search?projectId=N&q=… — повнотекстовий пошук по знаннях. */
knowledgeRouter.get("/search", async (req, res) => {
  const projectId = await getProjectId(req);
  if (projectId === null) {
    res.status(400).json({ error: "Потрібен валідний projectId" });
    return;
  }
  const q = typeof req.query.q === "string" ? req.query.q : "";
  res.json(await searchKnowledge(projectId, q, 10));
});

/**
 * POST /api/knowledge/ingest?projectId=N — інгест матеріалів у базу знань.
 * Тіло: { text, title } (нотатка) або { dir } (тека з файлами на сервері).
 */
knowledgeRouter.post("/ingest", async (req, res) => {
  const projectId = await getProjectId(req);
  if (projectId === null) {
    res.status(400).json({ error: "Потрібен валідний projectId" });
    return;
  }
  const body = req.body as Partial<IngestRequest>;
  try {
    if (body.text && body.text.trim()) {
      const { chunks } = await ingestText({
        projectId,
        title: body.title?.trim() || "Нотатка",
        text: body.text,
        kind: "note",
      });
      res.status(201).json({ sources: 1, chunks });
      return;
    }
    if (body.dir && body.dir.trim()) {
      const result = await ingestDir({ projectId, dir: body.dir.trim() });
      res.status(201).json(result);
      return;
    }
    res.status(400).json({ error: "Потрібен text або dir" });
  } catch (err) {
    res.status(500).json({
      error: err instanceof Error ? err.message : "Не вдалося проіндексувати",
    });
  }
});

/** DELETE /api/knowledge/:id?projectId=N — видалити джерело знань. */
knowledgeRouter.delete("/:id", async (req, res) => {
  const projectId = await getProjectId(req);
  if (projectId === null) {
    res.status(400).json({ error: "Потрібен валідний projectId" });
    return;
  }
  await deleteSource(Number(req.params.id), projectId);
  res.json({ ok: true });
});
