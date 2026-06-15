import type { Idea, IdeaSource, IdeaStatus } from "@swarm/shared";
import { query } from "./db.js";

/** Інбокс ідей (Фаза 6 фази 5): швидкі ідеї → у прогін одним кліком. */

interface IdeaRow {
  id: number;
  project_id: number | null;
  body: string;
  source: string;
  status: string;
  run_id: number | null;
  created_at: Date;
  project_name?: string;
}

function mapIdea(row: IdeaRow): Idea {
  return {
    id: row.id,
    projectId: row.project_id,
    body: row.body,
    source: row.source as IdeaSource,
    status: row.status as IdeaStatus,
    runId: row.run_id,
    createdAt: row.created_at.toISOString(),
    projectName: row.project_name,
  };
}

export async function createIdea(input: {
  body: string;
  projectId?: number | null;
  source?: IdeaSource;
}): Promise<Idea> {
  const { rows } = await query<IdeaRow>(
    `INSERT INTO idea_inbox (project_id, body, source)
     VALUES ($1, $2, $3) RETURNING *`,
    [input.projectId ?? null, input.body.trim(), input.source ?? "dashboard"],
  );
  return mapIdea(rows[0]);
}

export async function listIdeas(): Promise<Idea[]> {
  const { rows } = await query<IdeaRow>(
    `SELECT i.*, p.name AS project_name
     FROM idea_inbox i
     LEFT JOIN projects p ON p.id = i.project_id
     ORDER BY
       CASE i.status WHEN 'new' THEN 0 WHEN 'converted' THEN 1 ELSE 2 END,
       i.created_at DESC`,
  );
  return rows.map(mapIdea);
}

export async function getIdea(id: number): Promise<Idea | null> {
  const { rows } = await query<IdeaRow>("SELECT * FROM idea_inbox WHERE id = $1", [id]);
  return rows[0] ? mapIdea(rows[0]) : null;
}

export async function markIdeaConverted(id: number, runId: number): Promise<void> {
  await query(
    "UPDATE idea_inbox SET status = 'converted', run_id = $2 WHERE id = $1",
    [id, runId],
  );
}

export async function setIdeaStatus(id: number, status: IdeaStatus): Promise<void> {
  await query("UPDATE idea_inbox SET status = $2 WHERE id = $1", [id, status]);
}
