import { config } from "dotenv";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Завантажує .env з кореня монорепозиторію (на два рівні вище apps/backend).
 * Запасний варіант — .env у поточній робочій директорії.
 */
const here = dirname(fileURLToPath(import.meta.url));
const rootEnv = resolve(here, "../../../.env");
config({ path: existsSync(rootEnv) ? rootEnv : resolve(process.cwd(), ".env") });

function required(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (value === undefined || value === "") {
    throw new Error(`Відсутня обов'язкова змінна оточення: ${name}`);
  }
  return value;
}

// Порожні значення не повинні перекривати збережений логін Claude Code:
// видаляємо їх із process.env, щоб Agent SDK міг використати локальну
// автентифікацію (claude /login) як запасний шлях.
if (!process.env.CLAUDE_CODE_OAUTH_TOKEN) delete process.env.CLAUDE_CODE_OAUTH_TOKEN;
if (!process.env.ANTHROPIC_API_KEY) delete process.env.ANTHROPIC_API_KEY;

export const env = {
  databaseUrl: required(
    "DATABASE_URL",
    "postgresql://swarm:swarm@localhost:5432/ai_agent_swarm",
  ),
  backendPort: Number(process.env.BACKEND_PORT ?? 4000),
  /** Модель Claude для рушія діалогу. */
  anthropicModel: process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-6",
  /** OAuth-токен Claude Code (основний шлях доступу). */
  claudeOAuthToken: process.env.CLAUDE_CODE_OAUTH_TOKEN ?? "",
  /** API-ключ Anthropic (резервний шлях доступу). */
  anthropicApiKey: process.env.ANTHROPIC_API_KEY ?? "",
  /** Telegram-бот для сповіщень власника (необовʼязково). */
  telegramBotToken: process.env.TELEGRAM_BOT_TOKEN ?? "",
  telegramOwnerChatId: process.env.TELEGRAM_OWNER_CHAT_ID ?? "",
  /** Таймаут одного виклику агента, мс (захист від «зависання» виконавця). */
  agentTimeoutMs: Number(process.env.AGENT_TIMEOUT_MS ?? 180000),
  /** Пароль на дашборд (порожній — авторизацію вимкнено). */
  swarmPassword: process.env.SWARM_PASSWORD ?? "",
} as const;

/**
 * Чи задано явні креденшали Claude у .env.
 * Якщо ні — Agent SDK усе одно може спрацювати через збережений логін
 * Claude Code на цій машині, тому це лише інформаційний прапорець.
 */
export const hasClaudeCredentials =
  env.claudeOAuthToken !== "" || env.anthropicApiKey !== "";
