import { execFile } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { extname, join } from "node:path";
import { promisify } from "node:util";
import { env } from "./env.js";
import { UPLOADS_DIR } from "./knowledge.js";

/**
 * Інтеграція Higgsfield (Фаза «Дизайнер генерує зображення»).
 *
 * Бекенд викликає `higgsfield` CLI поверх збереженої сесії (НЕ API-ключ) —
 * та сама модель, що для Claude (спавн CLI + локальний логін). Працює headless
 * у фоновій черзі прогонів.
 *
 * Передумови (ручні, одноразові):
 *   1) встановити CLI: curl -fsSL .../install.sh | sh
 *   2) higgsfield auth login
 */

const exec = promisify(execFile);

/** Soul-моделі мають тир якості (--quality), але не приймають image-референси. */
const SOUL_MODELS = new Set(["text2image_soul_v2", "soul_cinematic", "soul_location"]);
/** Модель, що добре працює з image-референсами (image-to-image / reference-driven). */
const REFERENCE_MODEL = "nano_banana_2";

const IMAGE_EXT_BY_MIME: Record<string, string> = {
  "image/png": ".png",
  "image/jpeg": ".jpg",
  "image/webp": ".webp",
  "image/gif": ".gif",
};

const MIME_BY_EXT: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
};

export interface GeneratedImage {
  /** Відносний шлях усередині /uploads. */
  path: string;
  /** Публічний URL для показу. */
  url: string;
  bytes: number;
  mimeType: string;
}

export interface GenerateResult {
  images: GeneratedImage[];
  /** Сумарна вартість, якщо CLI її повертає; інакше null. */
  costUsd: number | null;
  /** Модель, якою фактично згенеровано. */
  model: string;
}

export interface GenerateOptions {
  prompt: string;
  /** Локальні шляхи референсів зі «Знань» (cover_photo / style_reference). */
  refImagePaths?: string[];
  /** Скільки зображень згенерувати (карусель). Типово 1. */
  count?: number;
  /** Співвідношення сторін (типово 3:4 — вертикальний IG-пост; Soul не приймає 4:5). */
  aspectRatio?: string;
  /** Override моделі; інакше — env.higgsfieldImageModel (Soul) / nano_banana при референсах. */
  model?: string;
  /** Прогін — для розкладання файлів у uploads/generated/<runId>/. */
  runId: number;
  timeoutMs?: number;
}

/**
 * Обирає модель. Якщо модель задано ЯВНО (per-run вибір власника) — поважаємо її
 * без авто-перемикання. Якщо ні — беремо дефолт; і лише для дефолтної Soul за
 * наявності референсів перемикаємось на reference-driven модель (зручність).
 */
function pickModel(requested: string, hasRefs: boolean): string {
  if (requested) return requested;
  const model = env.higgsfieldImageModel;
  if (hasRefs && SOUL_MODELS.has(model)) return REFERENCE_MODEL;
  return model;
}

function looksLikeAuthError(text: string): boolean {
  return /session expired|not authenticated|auth login|unauthor/i.test(text);
}

/** Зрізає першу збалансовану JSON-структуру з тексту (CLI може домішати рядки). */
function extractJson(text: string): unknown {
  const start = text.search(/[[{]/);
  if (start === -1) throw new Error("CLI не повернув JSON");
  const open = text[start];
  const close = open === "[" ? "]" : "}";
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inStr) {
      if (esc) esc = false;
      else if (ch === "\\") esc = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') inStr = true;
    else if (ch === open) depth++;
    else if (ch === close) {
      depth--;
      if (depth === 0) return JSON.parse(text.slice(start, i + 1));
    }
  }
  throw new Error("Не вдалося розібрати JSON CLI");
}

/** Рекурсивно збирає http(s)-URL-и зображень із довільного JSON job-обʼєкта. */
function collectImageUrls(node: unknown, out: string[]): void {
  if (typeof node === "string") {
    if (/^https?:\/\/\S+\.(png|jpe?g|webp|gif)(\?|$)/i.test(node)) out.push(node);
    return;
  }
  if (Array.isArray(node)) {
    for (const v of node) collectImageUrls(v, out);
    return;
  }
  if (node && typeof node === "object") {
    for (const v of Object.values(node)) collectImageUrls(v, out);
  }
}

/** Намагається витягти сумарну вартість із job-обʼєкта (поле cost/total_cost). */
function collectCost(node: unknown, acc: { sum: number; found: boolean }): void {
  if (Array.isArray(node)) {
    for (const v of node) collectCost(v, acc);
    return;
  }
  if (node && typeof node === "object") {
    for (const [k, v] of Object.entries(node)) {
      if (/cost/i.test(k) && typeof v === "number") {
        acc.sum += v;
        acc.found = true;
      } else {
        collectCost(v, acc);
      }
    }
  }
}

/** Розбирає stdout `--json` CLI у перелік URL-ів зображень + вартість. Експортовано для тестів. */
export function parseCliResult(stdout: string): { urls: string[]; cost: number | null } {
  const job = extractJson(stdout);
  const urls: string[] = [];
  collectImageUrls(job, urls);
  const costAcc = { sum: 0, found: false };
  collectCost(job, costAcc);
  return { urls: [...new Set(urls)], cost: costAcc.found ? costAcc.sum : null };
}

/** Один виклик CLI: повертає URL-и зображень + вартість (якщо є). */
async function runOnce(
  model: string,
  opts: GenerateOptions,
): Promise<{ urls: string[]; cost: number | null }> {
  const args = [
    "generate",
    "create",
    model,
    "--prompt",
    opts.prompt,
    "--aspect_ratio",
    opts.aspectRatio || "3:4",
    "--wait",
    "--json",
  ];
  if (SOUL_MODELS.has(model)) {
    args.push("--quality", "2k");
    // Soul не приймає --image (image-to-image) — референси пропускаємо.
  } else {
    for (const ref of opts.refImagePaths ?? []) args.push("--image", ref);
  }

  let stdout: string;
  try {
    const res = await exec(env.higgsfieldBin, args, {
      timeout: opts.timeoutMs ?? env.higgsfieldTimeoutMs,
      maxBuffer: 32 * 1024 * 1024,
    });
    stdout = res.stdout;
  } catch (err) {
    const e = err as { stdout?: string; stderr?: string; code?: string; message?: string };
    const blob = `${e.stderr ?? ""}\n${e.stdout ?? ""}\n${e.message ?? ""}`;
    if (e.code === "ENOENT") {
      throw new Error(
        `Higgsfield CLI не знайдено (${env.higgsfieldBin}). Встанови CLI й увійди: higgsfield auth login.`,
      );
    }
    if (looksLikeAuthError(blob)) {
      throw new Error("Сесія Higgsfield недійсна. Виконай `higgsfield auth login` на хості бекенду.");
    }
    throw new Error(`Higgsfield CLI помилка: ${(e.stderr || e.message || "").slice(0, 300)}`);
  }

  return parseCliResult(stdout);
}

/** Завантажує одне зображення за URL у uploads/generated/<runId>/. */
async function download(url: string, runId: number, ordinal: number): Promise<GeneratedImage> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Не вдалося завантажити зображення (${res.status})`);
  const rawCt = res.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase() || "";
  const buf = Buffer.from(await res.arrayBuffer());
  const isGeneric = !rawCt || rawCt === "binary/octet-stream" || rawCt === "application/octet-stream";
  // Розширення: з конкретного content-type, інакше — з URL.
  const ext = (IMAGE_EXT_BY_MIME[rawCt] || extname(new URL(url).pathname) || ".png").toLowerCase();
  // MIME: якщо CDN віддав generic octet-stream — виводимо з розширення.
  const mimeType = isGeneric ? MIME_BY_EXT[ext] ?? "image/png" : rawCt;
  const rel = `generated/${runId}/${randomUUID()}${ext}`;
  await mkdir(join(UPLOADS_DIR, "generated", String(runId)), { recursive: true });
  await writeFile(join(UPLOADS_DIR, rel), buf);
  return { path: rel, url: `/uploads/${rel}`, bytes: buf.byteLength, mimeType };
}

/**
 * Генерує 1…N зображень через Higgsfield CLI й завантажує їх у `uploads/`.
 * Для count>1 викликає CLI послідовно (кожен виклик — окреме зображення набору).
 */
export async function generateImages(opts: GenerateOptions): Promise<GenerateResult> {
  const hasRefs = (opts.refImagePaths?.length ?? 0) > 0;
  const model = pickModel(opts.model ?? "", hasRefs);
  const count = Math.max(1, Math.min(opts.count ?? 1, 10));

  const images: GeneratedImage[] = [];
  let costUsd: number | null = null;

  for (let i = 0; i < count; i++) {
    const { urls, cost } = await runOnce(model, opts);
    if (cost !== null) costUsd = (costUsd ?? 0) + cost;
    // Беремо перше зображення з кожного виклику (один слайд = один виклик).
    const url = urls[0];
    if (!url) throw new Error("Higgsfield не повернув зображення");
    images.push(await download(url, opts.runId, images.length));
  }

  return { images, costUsd, model };
}
