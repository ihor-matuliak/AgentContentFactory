import type { ProjectProfile, SaveProfileRequest } from "@swarm/shared";
import { query } from "./db.js";

/**
 * Профіль проєкту — єдиний бренд-контекст фабрики контенту.
 *
 * Зберігається в одному рядку таблиці `project_profile` (id = 1) і
 * домішується до системного промпту КОЖНОГО агента перед будь-яким запитом
 * до Claude — і в чаті, і в прогоні рою. Так усі агенти «знають» бізнес,
 * аудиторію, тон і табу, не дублюючи це в кожному характері.
 */

interface ProfileRow {
  business: string;
  audience: string;
  products: string;
  // У БД колонка зветься `tone_of_voice`; у типі/API — `tone`.
  tone_of_voice: string;
  taboos: string;
  examples: string;
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
  updatedAt: new Date(0).toISOString(),
};

/** Невеликий кеш, щоб не ходити в базу на кожен виклик агента. */
let cache: ProjectProfile | null = null;
let cachedAt = 0;
const CACHE_TTL_MS = 5000;

export async function getProfile(): Promise<ProjectProfile> {
  const now = Date.now();
  if (cache && now - cachedAt < CACHE_TTL_MS) return cache;
  const { rows } = await query<ProfileRow>(
    "SELECT * FROM project_profile WHERE id = 1",
  );
  cache = rows[0] ? mapProfile(rows[0]) : EMPTY;
  cachedAt = now;
  return cache;
}

export async function saveProfile(data: SaveProfileRequest): Promise<ProjectProfile> {
  const { rows } = await query<ProfileRow>(
    `INSERT INTO project_profile (id, business, audience, products, tone_of_voice, taboos, examples, updated_at)
     VALUES (1, $1, $2, $3, $4, $5, $6, now())
     ON CONFLICT (id) DO UPDATE SET
       business = EXCLUDED.business,
       audience = EXCLUDED.audience,
       products = EXCLUDED.products,
       tone_of_voice = EXCLUDED.tone_of_voice,
       taboos = EXCLUDED.taboos,
       examples = EXCLUDED.examples,
       updated_at = now()
     RETURNING *`,
    [
      data.business ?? "",
      data.audience ?? "",
      data.products ?? "",
      data.tone ?? "",
      data.taboos ?? "",
      data.examples ?? "",
    ],
  );
  cache = mapProfile(rows[0]);
  cachedAt = Date.now();
  return cache;
}

/** Текстовий блок профілю для домішування у системний промпт (або ""). */
export async function getProfileBlock(): Promise<string> {
  const p = await getProfile();
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

/** Прикладає бренд-контекст до характеру агента (системного промпту). */
export async function withProfile(systemPrompt: string): Promise<string> {
  const block = await getProfileBlock();
  return block ? `${systemPrompt}\n\n${block}` : systemPrompt;
}
