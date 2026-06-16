import { mkdir, readdir, readFile, stat, unlink, writeFile } from "node:fs/promises";
import type { Dirent } from "node:fs";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { dirname, extname, join, basename, resolve } from "node:path";
import type {
  IngestResult,
  KnowledgeCounts,
  KnowledgeKind,
  KnowledgeSearchHit,
  KnowledgeSource,
  KnowledgeSourceType,
} from "@swarm/shared";
import { query } from "./db.js";

/** Корінь для завантажених файлів зображень (репо-корінь /uploads/knowledge). */
const here = dirname(fileURLToPath(import.meta.url));
export const UPLOADS_DIR = resolve(here, "../../../uploads");
const KNOWLEDGE_UPLOADS = join(UPLOADS_DIR, "knowledge");

/** Текстові формати документів — індексуються у векторну базу. */
const DOC_TEXT_EXT = new Set([
  ".md",
  ".markdown",
  ".txt",
  ".text",
  ".rtf",
  ".org",
  ".csv",
  ".tsv",
  ".json",
]);
/** Формати зображень — зберігаємо файл, текст не парситься. */
const IMAGE_EXT = new Set([".png", ".jpg", ".jpeg", ".webp", ".gif"]);

const MIME_BY_EXT: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
};

/**
 * База знань проєкту (Фаза 5).
 *
 * Матеріали (нотатки, експортовані файли) ріжуться на чанки, складаються в
 * `knowledge_chunks` із повнотекстовим індексом (tsvector, конфіг 'simple').
 * Релевантні чанки домішуються в системні промпти агентів (див. context.ts).
 */

const CHUNK_TARGET = 1100; // приблизний розмір чанка в символах
const CHUNK_MAX = 1600;

/** Ріже текст на змістовні чанки по абзацах, не довші за CHUNK_MAX. */
export function chunkText(text: string): string[] {
  const paras = text
    .replace(/\r\n/g, "\n")
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);

  const chunks: string[] = [];
  let buf = "";
  for (const para of paras) {
    if (para.length >= CHUNK_MAX) {
      // Дуже довгий абзац — ріжемо по реченнях.
      if (buf) {
        chunks.push(buf);
        buf = "";
      }
      const sentences = para.split(/(?<=[.!?…])\s+/);
      let sb = "";
      for (const s of sentences) {
        if ((sb + " " + s).length > CHUNK_MAX) {
          if (sb) chunks.push(sb.trim());
          sb = s;
        } else {
          sb = sb ? `${sb} ${s}` : s;
        }
      }
      if (sb) chunks.push(sb.trim());
      continue;
    }
    if ((buf + "\n\n" + para).length > CHUNK_TARGET && buf) {
      chunks.push(buf);
      buf = para;
    } else {
      buf = buf ? `${buf}\n\n${para}` : para;
    }
  }
  if (buf) chunks.push(buf);
  return chunks.filter((c) => c.length > 0);
}

interface SourceRow {
  id: number;
  project_id: number;
  title: string;
  kind: string;
  source_type: string;
  visible_to_agents: string[] | null;
  path: string;
  bytes: number;
  chunk_count: number;
  created_at: Date;
  updated_at: Date;
}

/** Чи є джерело зображенням (за категорією). */
function isImageType(t: string): boolean {
  return t === "cover_photo" || t === "style_reference";
}

function mapSource(row: SourceRow): KnowledgeSource {
  const sourceType = (row.source_type || "document") as KnowledgeSourceType;
  const ext = extname(row.path).toLowerCase();
  return {
    id: row.id,
    projectId: row.project_id,
    title: row.title,
    kind: row.kind as KnowledgeKind,
    sourceType,
    visibleToAgents: row.visible_to_agents ?? [],
    path: row.path,
    // Для зображень path зберігає шлях усередині /uploads → публічний URL.
    url: isImageType(sourceType) && row.path ? `/uploads/${row.path}` : "",
    mimeType: isImageType(sourceType) ? MIME_BY_EXT[ext] ?? "" : "",
    bytes: row.bytes,
    chunkCount: row.chunk_count,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

/** Нормалізує список slug-ів видимості (порожньо → NULL = видно всім). */
function normalizeVisibility(slugs?: string[] | null): string[] | null {
  if (!slugs || slugs.length === 0) return null;
  const clean = [...new Set(slugs.map((s) => s.trim()).filter(Boolean))];
  return clean.length > 0 ? clean : null;
}

/** Інгест одного матеріалу (текст) у базу знань проєкту. */
export async function ingestText(input: {
  projectId: number;
  title: string;
  text: string;
  kind?: KnowledgeKind;
  path?: string;
  /** Категорія матеріалу (документи індексуються). Типово 'document'. */
  sourceType?: KnowledgeSourceType;
  /** Кому видно (порожньо/undefined = всім). */
  visibleToAgents?: string[] | null;
}): Promise<{ source: KnowledgeSource; chunks: number }> {
  const text = input.text.trim();
  const chunks = chunkText(text);
  const { rows } = await query<SourceRow>(
    `INSERT INTO knowledge_sources
       (project_id, title, kind, source_type, visible_to_agents, path, bytes, chunk_count)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
    [
      input.projectId,
      input.title.slice(0, 200),
      input.kind ?? "note",
      input.sourceType ?? "document",
      normalizeVisibility(input.visibleToAgents),
      input.path ?? "",
      Buffer.byteLength(text, "utf8"),
      chunks.length,
    ],
  );
  const source = rows[0];
  for (let i = 0; i < chunks.length; i++) {
    await query(
      `INSERT INTO knowledge_chunks (source_id, project_id, ordinal, content)
       VALUES ($1, $2, $3, $4)`,
      [source.id, input.projectId, i, chunks[i]],
    );
  }
  return { source: mapSource(source), chunks: chunks.length };
}

/** Витягує текст із завантаженого документа (текстові формати + PDF). */
async function extractDocumentText(buffer: Buffer, filename: string): Promise<string> {
  const ext = extname(filename).toLowerCase();
  if (ext === ".pdf") {
    try {
      // Імпорт із підшляху, щоб уникнути діагностичного коду pdf-parse при старті.
      // @ts-expect-error — у пакета немає типів для цього підшляху.
      const mod = await import("pdf-parse/lib/pdf-parse.js");
      const pdfParse = (mod.default ?? mod) as (b: Buffer) => Promise<{ text: string }>;
      const { text } = await pdfParse(buffer);
      return text ?? "";
    } catch {
      return "";
    }
  }
  // Текстові формати читаємо як UTF-8 (rtf лишаємо як є — це теж текст).
  return buffer.toString("utf8");
}

/**
 * Інгест завантаженого ДОКУМЕНТА (текст/PDF): витягуємо текст, ріжемо на чанки,
 * індексуємо у векторну базу. Шлях файлу на диску не зберігаємо — лишається лише
 * текстовий вміст у chunks.
 */
export async function ingestDocumentFile(input: {
  projectId: number;
  buffer: Buffer;
  filename: string;
  visibleToAgents?: string[] | null;
}): Promise<{ source: KnowledgeSource; chunks: number }> {
  const text = (await extractDocumentText(input.buffer, input.filename)).trim();
  return ingestText({
    projectId: input.projectId,
    title: input.filename,
    text: text || `(порожній або нерозпізнаний документ: ${input.filename})`,
    kind: "file",
    sourceType: "document",
    visibleToAgents: input.visibleToAgents,
  });
}

/**
 * Реєстрація ЗОБРАЖЕННЯ (обкладинка / референс стилю): зберігаємо файл на диск
 * під /uploads/knowledge і фіксуємо метадані у knowledge_sources (без чанків).
 */
export async function ingestImageFile(input: {
  projectId: number;
  buffer: Buffer;
  filename: string;
  sourceType: Extract<KnowledgeSourceType, "cover_photo" | "style_reference">;
  visibleToAgents?: string[] | null;
}): Promise<{ source: KnowledgeSource; chunks: number }> {
  const ext = extname(input.filename).toLowerCase();
  if (!IMAGE_EXT.has(ext)) {
    throw new Error(`Непідтримуваний формат зображення: ${ext || "без розширення"}`);
  }
  await mkdir(KNOWLEDGE_UPLOADS, { recursive: true });
  // Шлях усередині /uploads: knowledge/<projectId>-<uuid><ext>.
  const rel = `knowledge/${input.projectId}-${randomUUID()}${ext}`;
  await writeFile(join(UPLOADS_DIR, rel), input.buffer);

  const { rows } = await query<SourceRow>(
    `INSERT INTO knowledge_sources
       (project_id, title, kind, source_type, visible_to_agents, path, bytes, chunk_count)
     VALUES ($1, $2, 'file', $3, $4, $5, $6, 0) RETURNING *`,
    [
      input.projectId,
      input.filename.slice(0, 200),
      input.sourceType,
      normalizeVisibility(input.visibleToAgents),
      rel,
      input.buffer.byteLength,
    ],
  );
  return { source: mapSource(rows[0]), chunks: 0 };
}

const TEXT_EXT = new Set([".md", ".markdown", ".txt", ".text"]);

/** Рекурсивно збирає текстові файли з теки. */
async function collectFiles(dir: string): Promise<string[]> {
  const out: string[] = [];
  let entries: Dirent[];
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
      out.push(...(await collectFiles(full)));
    } else if (TEXT_EXT.has(extname(entry.name).toLowerCase())) {
      out.push(full);
    }
  }
  return out;
}

/** Інгест усіх текстових файлів із теки (для CLI та кнопки «Запустити інгест»). */
export async function ingestDir(input: {
  projectId: number;
  dir: string;
}): Promise<IngestResult> {
  const files = await collectFiles(input.dir);
  let sources = 0;
  let chunks = 0;
  for (const file of files) {
    try {
      const info = await stat(file);
      if (info.size === 0) continue;
      const text = await readFile(file, "utf8");
      if (!text.trim()) continue;
      const { chunks: n } = await ingestText({
        projectId: input.projectId,
        title: basename(file),
        text,
        kind: "file",
        path: file,
      });
      sources++;
      chunks += n;
    } catch {
      // пропускаємо нечитабельні файли
    }
  }
  return { sources, chunks };
}

/** Джерела знань проєкту (опційно — лише однієї категорії). */
export async function listSources(
  projectId: number,
  sourceType?: KnowledgeSourceType,
): Promise<KnowledgeSource[]> {
  const { rows } = sourceType
    ? await query<SourceRow>(
        "SELECT * FROM knowledge_sources WHERE project_id = $1 AND source_type = $2 ORDER BY id DESC",
        [projectId, sourceType],
      )
    : await query<SourceRow>(
        "SELECT * FROM knowledge_sources WHERE project_id = $1 ORDER BY id DESC",
        [projectId],
      );
  return rows.map(mapSource);
}

/**
 * Абсолютні локальні шляхи до зображень-референсів (cover_photo / style_reference),
 * видимих агенту, — для передачі в Higgsfield як `--image`. Найновіші — перші.
 */
export async function listAgentImageRefPaths(
  projectId: number,
  agentSlug: string,
  limit = 3,
): Promise<string[]> {
  const { rows } = await query<{ path: string }>(
    `SELECT path FROM knowledge_sources
     WHERE project_id = $1
       AND source_type IN ('cover_photo', 'style_reference')
       AND path <> ''
       AND (visible_to_agents IS NULL OR $2 = ANY(visible_to_agents))
     ORDER BY id DESC
     LIMIT $3`,
    [projectId, agentSlug, limit],
  );
  return rows.map((r) => join(UPLOADS_DIR, r.path));
}

/** Кількість джерел у кожній категорії — для лічильників на вкладках. */
export async function countByType(projectId: number): Promise<KnowledgeCounts> {
  const { rows } = await query<{ source_type: string; n: string }>(
    "SELECT source_type, COUNT(*)::int AS n FROM knowledge_sources WHERE project_id = $1 GROUP BY source_type",
    [projectId],
  );
  const counts: KnowledgeCounts = { document: 0, cover_photo: 0, style_reference: 0 };
  for (const r of rows) {
    if (r.source_type in counts) counts[r.source_type as KnowledgeSourceType] = Number(r.n);
  }
  return counts;
}

export async function deleteSource(id: number, projectId: number): Promise<void> {
  // Спершу прибираємо файл зображення з диска (якщо є), потім — рядок.
  const { rows } = await query<{ path: string; source_type: string }>(
    "SELECT path, source_type FROM knowledge_sources WHERE id = $1 AND project_id = $2",
    [id, projectId],
  );
  const row = rows[0];
  if (row && isImageType(row.source_type) && row.path) {
    try {
      await unlink(join(UPLOADS_DIR, row.path));
    } catch {
      // файл міг бути вже видалений — ігноруємо
    }
  }
  await query("DELETE FROM knowledge_sources WHERE id = $1 AND project_id = $2", [
    id,
    projectId,
  ]);
}

/**
 * Повнотекстовий пошук релевантних чанків у базі знань проєкту.
 *
 * Шукає лише серед ДОКУМЕНТІВ (зображення не індексуються). Якщо передано
 * `agentSlug` — повертає шматки лише з джерел, видимих цьому агенту
 * (`visible_to_agents IS NULL` АБО slug ∈ visible_to_agents).
 */
export async function searchKnowledge(
  projectId: number,
  queryText: string,
  limit = 4,
  agentSlug?: string | null,
): Promise<KnowledgeSearchHit[]> {
  const q = queryText.trim();
  if (!q) return [];
  const { rows } = await query<{
    chunk_id: number;
    source_id: number;
    source_title: string;
    content: string;
    rank: number;
  }>(
    `SELECT c.id AS chunk_id, c.source_id, s.title AS source_title, c.content,
            ts_rank(c.tsv, plainto_tsquery('simple', $2)) AS rank
     FROM knowledge_chunks c
     JOIN knowledge_sources s ON s.id = c.source_id
     WHERE c.project_id = $1
       AND c.tsv @@ plainto_tsquery('simple', $2)
       AND ($4::text IS NULL
            OR s.visible_to_agents IS NULL
            OR $4 = ANY(s.visible_to_agents))
     ORDER BY rank DESC, c.id ASC
     LIMIT $3`,
    [projectId, q, limit, agentSlug ?? null],
  );
  return rows.map((r) => ({
    chunkId: r.chunk_id,
    sourceId: r.source_id,
    sourceTitle: r.source_title,
    content: r.content,
    rank: Number(r.rank),
  }));
}

/** Текстовий блок релевантних знань для домішування у промпт (або ""). */
export async function getKnowledgeBlock(
  projectId: number,
  queryText: string,
  limit = 4,
  agentSlug?: string | null,
): Promise<string> {
  const hits = await searchKnowledge(projectId, queryText, limit, agentSlug);
  if (hits.length === 0) return "";
  const body = hits
    .map((h, i) => `[${i + 1}] (${h.sourceTitle})\n${h.content}`)
    .join("\n\n");
  return [
    "── РЕЛЕВАНТНІ ЗНАННЯ ПРОЄКТУ (спирайся на ці матеріали, якщо доречно) ──",
    body,
  ].join("\n");
}
