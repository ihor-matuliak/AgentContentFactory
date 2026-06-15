import type { Project, ProjectSummary } from "@swarm/shared";
import { query } from "./db.js";

/**
 * Проєкти (Фаза 5) — окремі канали/бренди власника.
 *
 * Кожен проєкт ізолює свої прогони, чати, контент, профіль і базу знань.
 * Агенти лишаються спільними для всіх проєктів; різниться лише контекст
 * (профіль + знання), який домішується в їхні промпти.
 */

interface ProjectRow {
  id: number;
  slug: string;
  name: string;
  description: string;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

function mapProject(row: ProjectRow): Project {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    description: row.description,
    isActive: row.is_active,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

/** Транслітерує назву у безпечний slug для URL. */
export function slugify(input: string): string {
  const map: Record<string, string> = {
    а: "a", б: "b", в: "v", г: "h", ґ: "g", д: "d", е: "e", є: "ie", ж: "zh",
    з: "z", и: "y", і: "i", ї: "i", й: "i", к: "k", л: "l", м: "m", н: "n",
    о: "o", п: "p", р: "r", с: "s", т: "t", у: "u", ф: "f", х: "kh", ц: "ts",
    ч: "ch", ш: "sh", щ: "shch", ь: "", ю: "iu", я: "ia",
  };
  const base = input
    .toLowerCase()
    .split("")
    .map((ch) => map[ch] ?? ch)
    .join("")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return base || `project-${Date.now()}`;
}

export async function listProjects(): Promise<ProjectSummary[]> {
  const { rows } = await query<
    ProjectRow & { runs: string; drafts: string; sources: string }
  >(
    `SELECT p.*,
            (SELECT COUNT(*) FROM runs r WHERE r.project_id = p.id)            AS runs,
            (SELECT COUNT(*) FROM content_drafts d WHERE d.project_id = p.id)  AS drafts,
            (SELECT COUNT(*) FROM knowledge_sources k WHERE k.project_id = p.id) AS sources
     FROM projects p
     ORDER BY p.id ASC`,
  );
  return rows.map((row) => ({
    ...mapProject(row),
    runs: Number(row.runs),
    drafts: Number(row.drafts),
    knowledgeSources: Number(row.sources),
  }));
}

export async function getProjectById(id: number): Promise<Project | null> {
  const { rows } = await query<ProjectRow>("SELECT * FROM projects WHERE id = $1", [id]);
  return rows[0] ? mapProject(rows[0]) : null;
}

export async function getProjectBySlug(slug: string): Promise<Project | null> {
  const { rows } = await query<ProjectRow>("SELECT * FROM projects WHERE slug = $1", [slug]);
  return rows[0] ? mapProject(rows[0]) : null;
}

/** id найпершого проєкту (демо) — типовий проєкт для Telegram/CLI. */
export async function defaultProjectId(): Promise<number | null> {
  const { rows } = await query<{ id: number }>(
    "SELECT id FROM projects ORDER BY id ASC LIMIT 1",
  );
  return rows[0]?.id ?? null;
}

export async function createProject(input: {
  name: string;
  slug?: string;
  description?: string;
}): Promise<Project> {
  let slug = input.slug?.trim() ? slugify(input.slug) : slugify(input.name);
  // Гарантуємо унікальність slug, додаючи суфікс за потреби.
  const { rows: existing } = await query<{ slug: string }>(
    "SELECT slug FROM projects WHERE slug LIKE $1",
    [`${slug}%`],
  );
  if (existing.some((r) => r.slug === slug)) {
    let n = 2;
    while (existing.some((r) => r.slug === `${slug}-${n}`)) n++;
    slug = `${slug}-${n}`;
  }
  const { rows } = await query<ProjectRow>(
    `INSERT INTO projects (slug, name, description)
     VALUES ($1, $2, $3) RETURNING *`,
    [slug, input.name.trim(), input.description?.trim() ?? ""],
  );
  // Створюємо порожній профіль проєкту.
  await query(
    "INSERT INTO project_profiles (project_id) VALUES ($1) ON CONFLICT (project_id) DO NOTHING",
    [rows[0].id],
  );
  return mapProject(rows[0]);
}
