import type { ActivityEntry, SwarmEvent, SwarmEventType } from "@swarm/shared";
import { query } from "./db.js";

// ───────────────────────── Журнал роботи рою (activity_log) ──────────────────

interface ActivityRow {
  id: number;
  run_id: number;
  actor: string;
  action: string;
  detail: string;
  created_at: Date;
}

export function mapActivity(row: ActivityRow): ActivityEntry {
  return {
    id: row.id,
    runId: row.run_id,
    actor: row.actor,
    action: row.action,
    detail: row.detail,
    createdAt: row.created_at.toISOString(),
  };
}

/**
 * Записує крок у журнал прогону: хто (actor — `owner`, `system` чи slug агента),
 * що зробив (action) і деталь.
 */
export async function logActivity(
  runId: number,
  actor: string,
  action: string,
  detail = "",
): Promise<void> {
  await query(
    "INSERT INTO activity_log (run_id, actor, action, detail) VALUES ($1, $2, $3, $4)",
    [runId, actor, action, detail.slice(0, 2000)],
  );
}

export async function listActivity(runId: number): Promise<ActivityEntry[]> {
  const { rows } = await query<ActivityRow>(
    "SELECT * FROM activity_log WHERE run_id = $1 ORDER BY id ASC",
    [runId],
  );
  return rows.map(mapActivity);
}

// ──────────────────────── Стрічка сповіщень власника (events) ─────────────────

interface EventRow {
  id: number;
  run_id: number | null;
  project_id: number | null;
  type: string;
  title: string;
  body: string;
  is_read: boolean;
  created_at: Date;
}

function mapEvent(row: EventRow): SwarmEvent {
  return {
    id: row.id,
    runId: row.run_id,
    projectId: row.project_id,
    type: row.type as SwarmEventType,
    title: row.title,
    body: row.body,
    isRead: row.is_read,
    createdAt: row.created_at.toISOString(),
  };
}

/**
 * Створює сповіщення для власника (підсвічується лічильником у меню).
 * Якщо projectId не задано, але є runId — визначаємо проєкт за прогоном.
 */
export async function addEvent(
  type: SwarmEventType,
  title: string,
  body = "",
  runId: number | null = null,
  projectId?: number | null,
): Promise<SwarmEvent> {
  let pid = projectId ?? null;
  if (pid === null && runId !== null) {
    const { rows } = await query<{ project_id: number | null }>(
      "SELECT project_id FROM runs WHERE id = $1",
      [runId],
    );
    pid = rows[0]?.project_id ?? null;
  }
  const { rows } = await query<EventRow>(
    "INSERT INTO events (run_id, project_id, type, title, body) VALUES ($1, $2, $3, $4, $5) RETURNING *",
    [runId, pid, type, title, body.slice(0, 2000)],
  );
  return mapEvent(rows[0]);
}

export async function listEvents(projectId: number, limit = 50): Promise<SwarmEvent[]> {
  const { rows } = await query<EventRow>(
    "SELECT * FROM events WHERE project_id = $1 ORDER BY id DESC LIMIT $2",
    [projectId, limit],
  );
  return rows.map(mapEvent);
}

export async function unreadEventCount(projectId: number): Promise<number> {
  const { rows } = await query<{ count: string }>(
    "SELECT COUNT(*)::int AS count FROM events WHERE is_read = FALSE AND project_id = $1",
    [projectId],
  );
  return Number(rows[0]?.count ?? 0);
}

export async function markEventRead(id: number): Promise<void> {
  await query("UPDATE events SET is_read = TRUE WHERE id = $1", [id]);
}

export async function markAllEventsRead(projectId: number): Promise<void> {
  await query(
    "UPDATE events SET is_read = TRUE WHERE is_read = FALSE AND project_id = $1",
    [projectId],
  );
}
