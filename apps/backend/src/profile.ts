import type { ProjectProfile, SaveProfileRequest } from "@swarm/shared";
import { query } from "./db.js";

/**
 * Профіль проєкту — бренд-контекст ПЕР-ПРОЄКТ (Фаза 5).
 *
 * Зберігається в таблиці `project_profiles` (один рядок на проєкт) і
 * домішується (разом із релевантними знаннями) до системного промпту КОЖНОГО
 * агента перед запитом до Claude — і в чаті, і в прогоні. Композиція профілю +
 * знань живе в `context.ts`.
 */

interface ProfileRow {
  project_id: number;
  business: string;
  audience: string;
  products: string;
  tone_of_voice: string;
  taboos: string;
  examples: string;
  telegram_channel: string;
  updated_at: Date;
}

function mapProfile(row: ProfileRow): ProjectProfile {
  return {
    business: row.business,
    audience: row.audience,
    products: row.products,
    tone: row.tone_of_voice,
    taboos: row.taboos,
    examples: row.examples,
    telegramChannel: row.telegram_channel,
    updatedAt: row.updated_at.toISOString(),
  };
}

const EMPTY: ProjectProfile = {
  business: "",
  audience: "",
  products: "",
  tone: "",
  taboos: "",
  examples: "",
  telegramChannel: "",
  updatedAt: new Date(0).toISOString(),
};

/** Кеш профілів за projectId, щоб не ходити в базу на кожен виклик агента. */
const cache = new Map<number, { profile: ProjectProfile; at: number }>();
const CACHE_TTL_MS = 5000;

export async function getProfile(projectId: number): Promise<ProjectProfile> {
  const now = Date.now();
  const hit = cache.get(projectId);
  if (hit && now - hit.at < CACHE_TTL_MS) return hit.profile;
  const { rows } = await query<ProfileRow>(
    "SELECT * FROM project_profiles WHERE project_id = $1",
    [projectId],
  );
  const profile = rows[0] ? mapProfile(rows[0]) : EMPTY;
  cache.set(projectId, { profile, at: now });
  return profile;
}

export async function saveProfile(
  projectId: number,
  data: SaveProfileRequest,
): Promise<ProjectProfile> {
  const { rows } = await query<ProfileRow>(
    `INSERT INTO project_profiles
       (project_id, business, audience, products, tone_of_voice, taboos, examples, telegram_channel, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, now())
     ON CONFLICT (project_id) DO UPDATE SET
       business = EXCLUDED.business,
       audience = EXCLUDED.audience,
       products = EXCLUDED.products,
       tone_of_voice = EXCLUDED.tone_of_voice,
       taboos = EXCLUDED.taboos,
       examples = EXCLUDED.examples,
       telegram_channel = EXCLUDED.telegram_channel,
       updated_at = now()
     RETURNING *`,
    [
      projectId,
      data.business ?? "",
      data.audience ?? "",
      data.products ?? "",
      data.tone ?? "",
      data.taboos ?? "",
      data.examples ?? "",
      data.telegramChannel ?? "",
    ],
  );
  const profile = mapProfile(rows[0]);
  cache.set(projectId, { profile, at: Date.now() });
  return profile;
}

/** Текстовий блок профілю для домішування у системний промпт (або ""). */
export async function getProfileBlock(projectId: number): Promise<string> {
  const p = await getProfile(projectId);
  const lines: string[] = [];
  if (p.business) lines.push(`Бізнес: ${p.business}`);
  if (p.audience) lines.push(`Аудиторія: ${p.audience}`);
  if (p.products) lines.push(`Продукти/послуги: ${p.products}`);
  if (p.tone) lines.push(`Тон і голос бренду: ${p.tone}`);
  if (p.taboos) lines.push(`Табу (чого уникати): ${p.taboos}`);
  if (p.examples) lines.push(`Приклади вдалого контенту: ${p.examples}`);
  if (lines.length === 0) return "";
  return [
    "── БРЕНД-КОНТЕКСТ ПРОЄКТУ (враховуй у кожній відповіді) ──",
    ...lines,
  ].join("\n");
}
