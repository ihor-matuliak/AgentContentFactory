import { readdir, readFile, stat } from "node:fs/promises";
import type { Dirent } from "node:fs";
import { extname, join, basename } from "node:path";
import type {
  IngestResult,
  KnowledgeKind,
  KnowledgeSearchHit,
  KnowledgeSource,
} from "@swarm/shared";
import { query } from "./db.js";

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
  path: string;
  bytes: number;
  chunk_count: number;
  created_at: Date;
  updated_at: Date;
}

function mapSource(row: SourceRow): KnowledgeSource {
  return {
    id: row.id,
    projectId: row.project_id,
    title: row.title,
    kind: row.kind as KnowledgeKind,
    path: row.path,
    bytes: row.bytes,
    chunkCount: row.chunk_count,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

/** Інгест одного матеріалу (текст) у базу знань проєкту. */
export async function ingestText(input: {
  projectId: number;
  title: string;
  text: string;
  kind?: KnowledgeKind;
  path?: string;
}): Promise<{ source: KnowledgeSource; chunks: number }> {
  const text = input.text.trim();
  const chunks = chunkText(text);
  const { rows } = await query<SourceRow>(
    `INSERT INTO knowledge_sources (project_id, title, kind, path, bytes, chunk_count)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
    [
      input.projectId,
      input.title.slice(0, 200),
      input.kind ?? "note",
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

export async function listSources(projectId: number): Promise<KnowledgeSource[]> {
  const { rows } = await query<SourceRow>(
    "SELECT * FROM knowledge_sources WHERE project_id = $1 ORDER BY id DESC",
    [projectId],
  );
  return rows.map(mapSource);
}

export async function deleteSource(id: number, projectId: number): Promise<void> {
  await query("DELETE FROM knowledge_sources WHERE id = $1 AND project_id = $2", [
    id,
    projectId,
  ]);
}

/** Повнотекстовий пошук релевантних чанків у базі знань проєкту. */
export async function searchKnowledge(
  projectId: number,
  queryText: string,
  limit = 4,
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
     WHERE c.project_id = $1 AND c.tsv @@ plainto_tsquery('simple', $2)
     ORDER BY rank DESC, c.id ASC
     LIMIT $3`,
    [projectId, q, limit],
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
): Promise<string> {
  const hits = await searchKnowledge(projectId, queryText, limit);
  if (hits.length === 0) return "";
  const body = hits
    .map((h, i) => `[${i + 1}] (${h.sourceTitle})\n${h.content}`)
    .join("\n\n");
  return [
    "── РЕЛЕВАНТНІ ЗНАННЯ ПРОЄКТУ (спирайся на ці матеріали, якщо доречно) ──",
    body,
  ].join("\n");
}
