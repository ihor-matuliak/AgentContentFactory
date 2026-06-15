import { Router } from "express";
import multer from "multer";
import { extname } from "node:path";
import type {
  IngestRequest,
  KnowledgeListResponse,
  KnowledgeSource,
  KnowledgeSourceType,
  UploadResult,
} from "@swarm/shared";
import { KNOWLEDGE_SOURCE_TYPES } from "@swarm/shared";
import {
  countByType,
  deleteSource,
  ingestDir,
  ingestDocumentFile,
  ingestImageFile,
  ingestText,
  listSources,
  searchKnowledge,
} from "../knowledge.js";
import { getProjectId } from "./projectScope.js";

export const knowledgeRouter = Router();

/** До 50 МБ на файл (як зазначено в UI), у пам'яті — далі ми його записуємо/чанкуємо. */
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 },
});

const IMAGE_EXT = new Set([".png", ".jpg", ".jpeg", ".webp", ".gif"]);

function parseSourceType(value: unknown): KnowledgeSourceType {
  return KNOWLEDGE_SOURCE_TYPES.includes(value as KnowledgeSourceType)
    ? (value as KnowledgeSourceType)
    : "document";
}

/** Розбирає visible_to_agents із FormData: JSON-масив, повторні поля або CSV. */
function parseVisibility(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String);
  if (typeof value === "string" && value.trim()) {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) return parsed.map(String);
    } catch {
      return value.split(",").map((s) => s.trim()).filter(Boolean);
    }
  }
  return [];
}

/**
 * GET /api/knowledge?projectId=N&sourceType=document — джерела знань проєкту
 * (опційно фільтр за категорією) + лічильники по всіх категоріях для вкладок.
 */
knowledgeRouter.get("/", async (req, res) => {
  const projectId = await getProjectId(req);
  if (projectId === null) {
    res.status(400).json({ error: "Потрібен валідний projectId" });
    return;
  }
  const sourceType =
    typeof req.query.sourceType === "string"
      ? parseSourceType(req.query.sourceType)
      : undefined;
  const [sources, counts] = await Promise.all([
    listSources(projectId, sourceType),
    countByType(projectId),
  ]);
  const body: KnowledgeListResponse = { sources, counts };
  res.json(body);
});

/**
 * GET /api/knowledge/search?projectId=N&q=…&agentSlug=… — повнотекстовий пошук.
 * Якщо задано agentSlug — лише джерела, видимі цьому агенту.
 */
knowledgeRouter.get("/search", async (req, res) => {
  const projectId = await getProjectId(req);
  if (projectId === null) {
    res.status(400).json({ error: "Потрібен валідний projectId" });
    return;
  }
  const q = typeof req.query.q === "string" ? req.query.q : "";
  const agentSlug =
    typeof req.query.agentSlug === "string" && req.query.agentSlug ? req.query.agentSlug : null;
  res.json(await searchKnowledge(projectId, q, 10, agentSlug));
});

/**
 * POST /api/knowledge?projectId=N — завантаження файлів (multipart/form-data).
 * Поля: files[] (вкладення), source_type, visible_to_agents (JSON-масив slug-ів).
 * Документи індексуються у векторну базу; зображення зберігаються як файли.
 */
knowledgeRouter.post("/", upload.array("files"), async (req, res) => {
  const projectId = await getProjectId(req);
  if (projectId === null) {
    res.status(400).json({ error: "Потрібен валідний projectId" });
    return;
  }
  const files = (req.files as Express.Multer.File[] | undefined) ?? [];
  if (files.length === 0) {
    res.status(400).json({ error: "Не передано жодного файлу" });
    return;
  }
  const sourceType = parseSourceType(req.body.source_type ?? req.body.sourceType);
  const visibleToAgents = parseVisibility(req.body.visible_to_agents ?? req.body.visibleToAgents);
  const wantsImage = sourceType === "cover_photo" || sourceType === "style_reference";

  const created: KnowledgeSource[] = [];
  let chunks = 0;
  try {
    for (const file of files) {
      const ext = extname(file.originalname).toLowerCase();
      const isImage = IMAGE_EXT.has(ext);
      // Захист від випадкового змішування: тип файлу має відповідати вкладці.
      if (wantsImage && !isImage) {
        throw new Error(`Очікувалося зображення, отримано «${file.originalname}»`);
      }
      if (!wantsImage && isImage) {
        throw new Error(`«${file.originalname}» — зображення. Завантажуй його у вкладці фото/референсів.`);
      }
      const result = wantsImage
        ? await ingestImageFile({
            projectId,
            buffer: file.buffer,
            filename: file.originalname,
            sourceType: sourceType as "cover_photo" | "style_reference",
            visibleToAgents,
          })
        : await ingestDocumentFile({
            projectId,
            buffer: file.buffer,
            filename: file.originalname,
            visibleToAgents,
          });
      created.push(result.source);
      chunks += result.chunks;
    }
  } catch (err) {
    res.status(400).json({
      error: err instanceof Error ? err.message : "Не вдалося завантажити файли",
    });
    return;
  }
  const body: UploadResult = { sources: created.length, chunks, created };
  res.status(201).json(body);
});

/**
 * POST /api/knowledge/ingest?projectId=N — інгест без файлу:
 * нотатка ({ text, title, visibleToAgents }) або тека ({ dir }) на сервері.
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
        sourceType: "document",
        visibleToAgents: body.visibleToAgents ?? null,
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
