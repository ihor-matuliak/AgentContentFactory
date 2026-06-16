import type {
  ContentDraft,
  ContentPlanItem,
  ContentPlanStatus,
  DraftStatus,
  Platform,
  RunTask,
} from "@swarm/shared";
import { query } from "./db.js";
import { listAssetsByTask } from "./store.js";

// ───────────────────────────── Майданчик за текстом ──────────────────────────

/** Визначає майданчик публікації за описом/слугом завдання. */
export function detectPlatform(text: string): Platform {
  const t = text.toLowerCase();
  if (/(youtube|ютуб|shorts|шортс|yt\b)/.test(t)) return "youtube";
  if (/(telegram|телеграм|\btg\b|тґ)/.test(t)) return "telegram";
  if (/(instagram|інстаграм|инстаграм|reels|рілс|reel|\big\b|сторіс|stories)/.test(t))
    return "instagram";
  return "other";
}

// ──────────────────────────────── Чернетки ───────────────────────────────────

interface DraftRow {
  id: number;
  project_id: number;
  run_id: number | null;
  task_id: number | null;
  agent_slug: string;
  platform: string;
  title: string;
  body: string;
  image_urls: string[] | null;
  status: string;
  created_at: Date;
  updated_at: Date;
}

function mapDraft(row: DraftRow): ContentDraft {
  return {
    id: row.id,
    projectId: row.project_id,
    runId: row.run_id,
    taskId: row.task_id,
    agentSlug: row.agent_slug,
    platform: row.platform as Platform,
    title: row.title,
    body: row.body,
    imageUrls: row.image_urls ?? [],
    status: row.status as DraftStatus,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

export async function createDraft(input: {
  projectId: number;
  runId: number | null;
  taskId: number | null;
  agentSlug: string;
  platform: Platform;
  title: string;
  body: string;
  imageUrls?: string[];
}): Promise<ContentDraft> {
  const { rows } = await query<DraftRow>(
    `INSERT INTO content_drafts (project_id, run_id, task_id, agent_slug, platform, title, body, image_urls)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
    [
      input.projectId,
      input.runId,
      input.taskId,
      input.agentSlug,
      input.platform,
      input.title,
      input.body,
      input.imageUrls && input.imageUrls.length > 0 ? input.imageUrls : null,
    ],
  );
  return mapDraft(rows[0]);
}

export async function listDrafts(projectId: number): Promise<ContentDraft[]> {
  const { rows } = await query<DraftRow>(
    "SELECT * FROM content_drafts WHERE project_id = $1 ORDER BY id DESC",
    [projectId],
  );
  return rows.map(mapDraft);
}

// ──────────────────────────────── Контент-план ───────────────────────────────

interface PlanRow {
  id: number;
  project_id: number;
  draft_id: number | null;
  run_id: number | null;
  platform: string;
  title: string;
  notes: string;
  scheduled_for: Date | string | null;
  status: string;
  created_at: Date;
  updated_at: Date;
}

function toDateString(value: Date | string | null): string | null {
  if (value === null) return null;
  if (typeof value === "string") return value.slice(0, 10);
  return value.toISOString().slice(0, 10);
}

/**
 * Нормалізує дату для колонки TIMESTAMPTZ: чисту дату (YYYY-MM-DD) зберігаємо
 * як полудень UTC, щоб день не зсувався через часовий пояс. null лишаємо null.
 */
function normalizeSchedule(value: string | null | undefined): string | null {
  if (!value) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return `${value}T12:00:00.000Z`;
  return value;
}

function mapPlan(row: PlanRow): ContentPlanItem {
  return {
    id: row.id,
    projectId: row.project_id,
    draftId: row.draft_id,
    runId: row.run_id,
    platform: row.platform as Platform,
    title: row.title,
    notes: row.notes,
    scheduledFor: toDateString(row.scheduled_for),
    status: row.status as ContentPlanStatus,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

export async function createPlanItem(input: {
  projectId: number;
  draftId: number | null;
  runId: number | null;
  platform: Platform;
  title: string;
  notes?: string;
  scheduledFor?: string | null;
}): Promise<ContentPlanItem> {
  const { rows } = await query<PlanRow>(
    `INSERT INTO content_plan (project_id, draft_id, run_id, platform, title, notes, scheduled_for)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
    [
      input.projectId,
      input.draftId,
      input.runId,
      input.platform,
      input.title,
      input.notes ?? "",
      normalizeSchedule(input.scheduledFor),
    ],
  );
  return mapPlan(rows[0]);
}

export async function listPlan(projectId: number): Promise<ContentPlanItem[]> {
  const { rows } = await query<PlanRow>(
    "SELECT * FROM content_plan WHERE project_id = $1 ORDER BY scheduled_for NULLS LAST, id DESC",
    [projectId],
  );
  return rows.map(mapPlan);
}

/** Один запис контент-плану за id (для публікації). */
export async function getPlanItem(id: number): Promise<ContentPlanItem | null> {
  const { rows } = await query<PlanRow>("SELECT * FROM content_plan WHERE id = $1", [id]);
  return rows[0] ? mapPlan(rows[0]) : null;
}

/** Тіло чернетки за id (для публікації повного тексту). */
export async function getDraftBody(id: number): Promise<string> {
  const { rows } = await query<{ body: string }>(
    "SELECT body FROM content_drafts WHERE id = $1",
    [id],
  );
  return rows[0]?.body ?? "";
}

export async function updatePlanItem(
  id: number,
  patch: {
    platform?: Platform;
    title?: string;
    notes?: string;
    scheduledFor?: string | null;
    status?: ContentPlanStatus;
  },
): Promise<ContentPlanItem | null> {
  const sets: string[] = [];
  const params: unknown[] = [id];
  const push = (col: string, val: unknown) => {
    params.push(val);
    sets.push(`${col} = $${params.length}`);
  };
  if (patch.platform !== undefined) push("platform", patch.platform);
  if (patch.title !== undefined) push("title", patch.title);
  if (patch.notes !== undefined) push("notes", patch.notes);
  if (patch.scheduledFor !== undefined)
    push("scheduled_for", normalizeSchedule(patch.scheduledFor));
  if (patch.status !== undefined) push("status", patch.status);
  if (sets.length === 0) {
    const { rows } = await query<PlanRow>("SELECT * FROM content_plan WHERE id = $1", [id]);
    return rows[0] ? mapPlan(rows[0]) : null;
  }
  const { rows } = await query<PlanRow>(
    `UPDATE content_plan SET ${sets.join(", ")}, updated_at = now() WHERE id = $1 RETURNING *`,
    params,
  );
  return rows[0] ? mapPlan(rows[0]) : null;
}

export async function deletePlanItem(id: number): Promise<void> {
  await query("DELETE FROM content_plan WHERE id = $1", [id]);
}

// ─────────────────── Замкнута петля: схвалене завдання → чернетка ─────────────

/**
 * Перетворює результат схваленого завдання-публікації на чернетку
 * і додає її в контент-план. Викликається при схваленні завдання власником.
 * Повертає створену чернетку (або null, якщо завдання не публікаційне/без результату).
 */
export async function draftFromApprovedTask(
  task: RunTask,
  projectId: number,
): Promise<ContentDraft | null> {
  // Ідемпотентність: одна чернетка на завдання (гейт-схвалення + фінальний огляд
  // можуть обидва викликати цю функцію для того самого завдання).
  const existing = await query<{ id: number }>(
    "SELECT id FROM content_drafts WHERE task_id = $1 LIMIT 1",
    [task.id],
  );
  if (existing.rows.length > 0) return null;

  // Схвалені зображення Higgsfield (для завдань Дизайнера на гейті).
  const imageUrls = (await listAssetsByTask(task.id))
    .filter((a) => a.status === "approved")
    .map((a) => a.url);

  const platform = detectPlatform(`${task.description} ${task.result}`);
  // Публікаційним вважаємо завдання Публікатора, будь-яке з упізнаваним
  // майданчиком (Telegram/YouTube/Instagram), з ознаками контент-допису, або
  // таке, що має схвалений візуал.
  const isPublication =
    task.agentSlug === "publisher" ||
    platform !== "other" ||
    imageUrls.length > 0 ||
    /(публ|постинг|post|опублік|випуск|реліз|допис|анонс|caption|підпис|сценар|reels|рілс|shorts)/i.test(
      task.description,
    );
  if (!isPublication || (!task.result.trim() && imageUrls.length === 0)) return null;
  const title = task.description.slice(0, 120);
  const draft = await createDraft({
    projectId,
    runId: task.runId,
    taskId: task.id,
    agentSlug: task.agentSlug,
    platform,
    title,
    body: task.result,
    imageUrls,
  });
  await createPlanItem({
    projectId,
    draftId: draft.id,
    runId: task.runId,
    platform,
    title,
    notes: "Створено автоматично зі схваленого завдання-публікації.",
    scheduledFor: null,
  });
  return draft;
}
