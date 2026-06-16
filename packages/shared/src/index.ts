/**
 * @swarm/shared — спільні типи даних для рою агентів.
 * Використовується і бекендом (@swarm/backend), і дашбордом (@swarm/dashboard).
 */

/** Статус агента в рої. */
export type AgentStatus = "idle" | "busy" | "offline";

/** Роль автора повідомлення в чаті. */
export type ChatRole = "user" | "assistant" | "system";

/** Агент рою (рядок таблиці `agents`). */
export interface Agent {
  id: number;
  /** Унікальний машинний ідентифікатор, напр. "strategist". */
  slug: string;
  /** Людська назва, напр. "Стратег". */
  name: string;
  /** Коротка роль/спеціалізація агента. */
  role: string;
  /** Системний промпт, що задає характер агента. */
  systemPrompt: string;
  status: AgentStatus;
  isActive: boolean;
}

/** Публічний вигляд агента без системного промпту (для списків у UI). */
export type AgentSummary = Omit<Agent, "systemPrompt">;

/** Повідомлення чату (рядок таблиці `chat_messages`). */
export interface ChatMessage {
  id: number;
  agentId: number;
  /** Проєкт, у контексті якого ведеться чат (Фаза 5). */
  projectId: number;
  role: ChatRole;
  content: string;
  /** ISO-рядок дати створення. */
  createdAt: string;
}

/** Тіло запиту POST /api/agents/:slug/chat. */
export interface ChatRequest {
  message: string;
}

/** Відповідь POST /api/agents/:slug/chat. */
export interface ChatResponse {
  /** Збережене повідомлення користувача. */
  userMessage: ChatMessage;
  /** Збережена відповідь агента. */
  reply: ChatMessage;
}

/** Відповідь GET /api/health. */
export interface HealthResponse {
  status: "ok";
  service: string;
  time: string;
}

/** Стандартний формат помилки API. */
export interface ApiError {
  error: string;
}

// ───────────────────────────── Фаза 3: Прогони рою ─────────────────────────────

/** Розмір прогону: дрібний стартує одразу, великий чекає схвалення плану. */
export type RunSize = "small" | "large";

/**
 * Статус прогону рою:
 * - `planning` — Стратег розбиває ціль на завдання;
 * - `awaiting_approval` — план готовий, чекає на «Запустити» від власника (великі прогони);
 * - `running` — виконавці працюють, Критик перевіряє;
 * - `awaiting_review` — усі завдання відпрацьовані, чекає на перевірку власника;
 * - `completed` — власник схвалив, прогін завершено;
 * - `failed` — прогін зупинено через помилку.
 */
export type RunStatus =
  | "planning"
  | "awaiting_approval"
  | "running"
  | "awaiting_review"
  | "completed"
  | "failed";

/**
 * Статус завдання на дошці:
 * - `pending` — чекає черги (можливо, на залежності);
 * - `in_progress` — виконавець працює або результат у Критика;
 * - `waiting_question` — виконавець поставив уточнювальне питання й чекає на відповідь власника;
 * - `done` — результат прийнято Критиком, чекає на перевірку власника;
 * - `approved` — власник схвалив результат;
 * - `failed` — не вдалося виконати.
 */
export type TaskStatus =
  | "pending"
  | "in_progress"
  | "waiting_question"
  | "awaiting_approval"
  | "done"
  | "approved"
  | "failed";

/** Вердикт Критика щодо результату завдання. */
export type CriticVerdict = "" | "approved" | "needs_revision";

/** Тип сповіщення для власника. */
export type SwarmEventType =
  | "info"
  | "run_created"
  | "plan_ready"
  | "run_started"
  | "revision_requested"
  | "run_review"
  | "run_completed"
  | "run_failed"
  | "question_asked"
  | "visual_approval"
  | "draft_created";

/** Прогін рою (рядок таблиці `runs`). */
export interface Run {
  id: number;
  /** Проєкт, до якого належить прогін (Фаза 5). */
  projectId: number;
  goal: string;
  size: RunSize;
  status: RunStatus;
  /** Фінальне зведення прогону (markdown). */
  summary: string;
  /** Текст помилки, якщо прогін впав. */
  error: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  /** Ліміт витрат на прогін у USD (null — без ліміту). */
  maxBudgetUsd: number | null;
  /** Модель Higgsfield для генерації зображень (null — серверний дефолт). */
  imageModel: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Завдання дошки (рядок таблиці `tasks`). */
export interface RunTask {
  id: number;
  runId: number;
  agentSlug: string;
  /** Назва агента-виконавця (join з agents для UI). */
  agentName?: string;
  /** Опис завдання — він же слугує заголовком на дошці. */
  description: string;
  status: TaskStatus;
  /** Готовий результат виконавця (markdown). */
  result: string;
  /** Машинний вердикт Критика. */
  criticVerdict: CriticVerdict;
  /** Розгорнутий коментар Критика. */
  criticComment: string;
  /** Коментар власника при відправленні на доопрацювання. */
  ownerFeedback: string;
  /** ID завдань цього прогону, від яких залежить це. */
  dependsOn: number[];
  /** Скільки кіл доопрацювання вже пройдено. */
  revisionRound: number;
  /** Порядок виконання в межах прогону. */
  sortOrder: number;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  /** Уточнювальне питання виконавця (якщо було). */
  question: string;
  /** Відповідь на уточнення. */
  answer: string;
  /** Згенеровані зображення Higgsfield (для завдань Дизайнера на гейті). */
  generatedAssets?: GeneratedAsset[];
  createdAt: string;
  updatedAt: string;
}

/**
 * Згенероване зображення (рядок таблиці `generated_assets`).
 * Створюється інструментом `generate_image` Дизайнера; переглядається на гейті.
 */
export interface GeneratedAsset {
  id: number;
  projectId: number;
  runId: number;
  taskId: number;
  /** Порядок у наборі (обкладинка=0, слайди далі). */
  ordinal: number;
  /** Промпт, яким згенеровано. */
  prompt: string;
  /** Модель Higgsfield (напр. text2image_soul_v2). */
  model: string;
  /** Публічний URL для показу (через статику /uploads). */
  url: string;
  bytes: number;
  mimeType: string;
  /** generated — щойно створено; approved/rejected — рішення на гейті. */
  status: "generated" | "approved" | "rejected";
  createdAt: string;
}

/** Сповіщення для власника (рядок таблиці `events`). */
export interface SwarmEvent {
  id: number;
  runId: number | null;
  /** Проєкт, до якого належить подія (Фаза 5; може бути null). */
  projectId: number | null;
  type: SwarmEventType;
  title: string;
  body: string;
  isRead: boolean;
  createdAt: string;
}

/** Запис журналу роботи рою (рядок таблиці `activity_log`). */
export interface ActivityEntry {
  id: number;
  runId: number;
  /** Хто діяв: `owner`, `system` або slug агента. */
  actor: string;
  action: string;
  detail: string;
  createdAt: string;
}

/** Прогін у списку разом із лічильниками завдань. */
export interface RunSummary extends Run {
  totalTasks: number;
  doneTasks: number;
}

/** Повна картина одного прогону. */
export interface RunDetail {
  run: Run;
  tasks: RunTask[];
  activity: ActivityEntry[];
}

/** Елемент черги «На перевірці» — завдання + його прогін. */
export interface ReviewItem {
  task: RunTask;
  run: Run;
}

/** Тіло запиту POST /api/runs — створити прогін. */
export interface CreateRunRequest {
  /** Проєкт, у якому створюється прогін (Фаза 5). */
  projectId: number;
  goal: string;
  /** Якщо не задано — розмір визначає Стратег під час планування. */
  size?: RunSize;
  /** Необов'язковий ліміт витрат на прогін, USD. */
  maxBudgetUsd?: number;
  /** Модель Higgsfield для генерації зображень (опційно; інакше — дефолт). */
  imageModel?: string;
}

/** Доступна модель генерації зображень для вибору в UI. */
export interface ImageModelOption {
  id: string;
  label: string;
  hint: string;
}

/** Курований перелік моделей Higgsfield для вибору перед запуском (перша — дефолт). */
export const IMAGE_MODELS: readonly ImageModelOption[] = [
  { id: "text2image_soul_v2", label: "Soul 2.0", hint: "Естетика, lifestyle, editorial (типово)" },
  { id: "soul_cinematic", label: "Soul Cinema", hint: "Кінематографічний кадр, атмосферне світло" },
  { id: "gpt_image_2", label: "GPT Image 2", hint: "Текст і типографіка на зображенні, банери, UI" },
  { id: "nano_banana_2", label: "Nano Banana 2", hint: "Персонажі, стилізація, робота з референсами" },
  { id: "z_image", label: "Z Image", hint: "Швидко й дешево для ітерацій" },
] as const;

/** Чи дозволений id моделі (для валідації на бекенді). */
export function isValidImageModel(id: string): boolean {
  return IMAGE_MODELS.some((m) => m.id === id);
}

/**
 * Тіло запиту POST /api/runs/solo — пряме (solo) завдання конкретному агенту,
 * оминаючи планування Стратега (Фаза 5).
 */
export interface SoloTaskRequest {
  projectId: number;
  agentSlug: string;
  goal: string;
  maxBudgetUsd?: number;
  /** Модель Higgsfield для генерації зображень (опційно; інакше — дефолт). */
  imageModel?: string;
}

/** Тіло запиту POST /api/runs/:id/tasks/:taskId/review. */
export interface ReviewDecisionRequest {
  decision: "approve" | "rework";
  comment?: string;
}

/**
 * Тіло запиту POST /api/runs/:id/tasks/:taskId/visual — рішення власника на
 * гейті схвалення згенерованого візуалу (посеред прогону).
 */
export interface VisualDecisionRequest {
  projectId: number;
  decision: "approve" | "rework";
  /** Коментар для доопрацювання (для decision='rework'). */
  comment?: string;
}

// ──────────────────────────── Фаза 4: фабрика контенту ───────────────────────

/** Майданчик публікації. */
export type Platform = "youtube" | "telegram" | "instagram" | "other";

/** Профіль проєкту — бренд-контекст ПЕР-ПРОЄКТ (рядок таблиці `project_profiles`). */
export interface ProjectProfile {
  /** Чим займається бізнес. */
  business: string;
  /** Цільова аудиторія. */
  audience: string;
  /** Продукти/послуги. */
  products: string;
  /** Бажаний тон і голос бренду. */
  tone: string;
  /** Табу — чого уникати. */
  taboos: string;
  /** Приклади вдалого контенту/формулювань. */
  examples: string;
  /** chat_id Telegram-каналу проєкту для публікацій (Фаза 5). */
  telegramChannel: string;
  updatedAt: string;
}

/** Тіло запиту PUT /api/profile. */
export type SaveProfileRequest = Omit<ProjectProfile, "updatedAt">;

/** Статус чернетки контенту. */
export type DraftStatus = "draft" | "scheduled" | "published";

/** Чернетка контенту (рядок таблиці `content_drafts`). */
export interface ContentDraft {
  id: number;
  /** Проєкт, до якого належить чернетка (Фаза 5). */
  projectId: number;
  runId: number | null;
  taskId: number | null;
  agentSlug: string;
  platform: Platform;
  title: string;
  body: string;
  /** Публічні URL прикріплених зображень (схвалений візуал Дизайнера). */
  imageUrls: string[];
  status: DraftStatus;
  createdAt: string;
  updatedAt: string;
}

/** Статус елемента контент-плану. */
export type ContentPlanStatus = "planned" | "published";

/** Елемент контент-плану (рядок таблиці `content_plan`). */
export interface ContentPlanItem {
  id: number;
  /** Проєкт, до якого належить запис (Фаза 5). */
  projectId: number;
  draftId: number | null;
  runId: number | null;
  platform: Platform;
  title: string;
  notes: string;
  /** ISO-дата (YYYY-MM-DD) запланованої публікації, або null. */
  scheduledFor: string | null;
  status: ContentPlanStatus;
  createdAt: string;
  updatedAt: string;
}

/** Завдання для дошки «Задачі» разом із контекстом прогону. */
export interface BoardTask extends RunTask {
  runGoal: string;
  runStatus: RunStatus;
}

/** Тіло запиту PATCH /api/runs/:id/tasks/:taskId — правка завдання власником. */
export interface UpdateTaskRequest {
  description?: string;
  agentSlug?: string;
  status?: TaskStatus;
}

/** Тіло запиту POST /api/runs/:id/tasks — додати завдання у план. */
export interface AddTaskRequest {
  description: string;
  agentSlug: string;
  dependsOn?: number[];
}

/** Тіло запиту POST /api/runs/:id/tasks/:taskId/answer — відповідь на уточнення. */
export interface AnswerQuestionRequest {
  answer: string;
}

/** Відповідь GET /api/auth — чи ввімкнено захист паролем. */
export interface AuthStatusResponse {
  required: boolean;
}

/** Тіло запиту POST /api/auth/login. */
export interface LoginRequest {
  password: string;
}

// ════════════════════════════ Фаза 5: мультипроєкти ═══════════════════════════

/** Проєкт — окремий канал/бренд власника (рядок таблиці `projects`). */
export interface Project {
  id: number;
  /** Унікальний машинний ідентифікатор у URL, напр. "ai-proryv". */
  slug: string;
  name: string;
  description: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

/** Проєкт у списку разом із короткою статистикою. */
export interface ProjectSummary extends Project {
  runs: number;
  drafts: number;
  knowledgeSources: number;
}

/** Тіло запиту POST /api/projects — створити проєкт. */
export interface CreateProjectRequest {
  name: string;
  /** Якщо не задано — генерується зі slug назви. */
  slug?: string;
  description?: string;
}

// ──────────────────────────────── База знань ─────────────────────────────────

/** Тип джерела знань. */
export type KnowledgeKind = "note" | "file" | "reference";

/**
 * Категорія матеріалу бази знань (Фаза 5 v2):
 *  • document        — текст/документ, що індексується у векторну базу;
 *  • cover_photo     — зображення для прямого використання в обкладинках;
 *  • style_reference — візуальний референс стилю для Дизайнера.
 */
export type KnowledgeSourceType = "document" | "cover_photo" | "style_reference";

/** Усі категорії матеріалів — для вкладок/ітерації. */
export const KNOWLEDGE_SOURCE_TYPES: readonly KnowledgeSourceType[] = [
  "document",
  "cover_photo",
  "style_reference",
] as const;

/** Джерело знань проєкту (рядок таблиці `knowledge_sources`). */
export interface KnowledgeSource {
  id: number;
  projectId: number;
  title: string;
  kind: KnowledgeKind;
  /** Категорія матеріалу (вкладка). */
  sourceType: KnowledgeSourceType;
  /**
   * Slug-и агентів, яким видно це джерело. Порожній масив = видно ВСІМ агентам
   * проєкту (для зручності фронтенду NULL у БД нормалізуємо в []).
   */
  visibleToAgents: string[];
  /** Шлях до файлу або URL посилання. */
  path: string;
  /** Публічний URL для зображень (cover_photo / style_reference) або "". */
  url: string;
  bytes: number;
  chunkCount: number;
  /** MIME-тип завантаженого файлу (для зображень) або "". */
  mimeType: string;
  createdAt: string;
  updatedAt: string;
}

/** Кількість джерел у кожній категорії — для лічильників на вкладках. */
export type KnowledgeCounts = Record<KnowledgeSourceType, number>;

/** Відповідь GET /api/knowledge: джерела (за фільтром) + лічильники по категоріях. */
export interface KnowledgeListResponse {
  sources: KnowledgeSource[];
  counts: KnowledgeCounts;
}

/** Шматок (чанк) знань для повнотекстового пошуку (рядок `knowledge_chunks`). */
export interface KnowledgeChunk {
  id: number;
  sourceId: number;
  projectId: number;
  ordinal: number;
  content: string;
  createdAt: string;
}

/** Знахідка повнотекстового пошуку по базі знань. */
export interface KnowledgeSearchHit {
  chunkId: number;
  sourceId: number;
  sourceTitle: string;
  content: string;
  rank: number;
}

/** Тіло запиту POST /api/knowledge/ingest. */
export interface IngestRequest {
  /** Тека з матеріалами (для CLI/сервера). */
  dir?: string;
  /** Або текст нотатки напряму. */
  text?: string;
  title?: string;
  /** Кому видно нотатку (порожньо = всім). */
  visibleToAgents?: string[];
}

/** Результат інгесту бази знань. */
export interface IngestResult {
  sources: number;
  chunks: number;
}

/** Результат завантаження файлів (POST /api/knowledge). */
export interface UploadResult {
  /** Скільки джерел створено. */
  sources: number;
  /** Скільки чанків проіндексовано (для документів). */
  chunks: number;
  /** Створені джерела (для миттєвого показу в UI). */
  created: KnowledgeSource[];
}

// ──────────────────────────────── Фабрика тестів ─────────────────────────────

/** Вердикт тесту. */
export type TestVerdict = "" | "pass" | "fail";

/** Тестовий сценарій для агента (рядок таблиці `test_scenarios`). */
export interface TestScenario {
  id: number;
  agentSlug: string;
  title: string;
  prompt: string;
  /** Критерії якісного виконання для Критика. */
  rubric: string;
  isActive: boolean;
  createdAt: string;
}

/** Результат прогону тесту (рядок таблиці `test_runs`). */
export interface TestRun {
  id: number;
  scenarioId: number;
  agentSlug: string;
  verdict: TestVerdict;
  score: number | null;
  comment: string;
  answer: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  durationMs: number;
  createdAt: string;
  /** Назва сценарію (join для UI). */
  scenarioTitle?: string;
}

/** Зведення якості по одному агенту. */
export interface TestAgentSummary {
  agentSlug: string;
  agentName: string;
  total: number;
  passed: number;
  failed: number;
  /** Частка пройдених (0..1). */
  passRate: number;
  costUsd: number;
  avgDurationMs: number;
}

/** Відповідь GET /api/tests — зведення фабрики тестів. */
export interface TestsOverview {
  scenarios: number;
  totalRuns: number;
  passRate: number;
  costUsd: number;
  byAgent: TestAgentSummary[];
  recent: TestRun[];
}

// ──────────────────────────────── Інбокс ідей ────────────────────────────────

export type IdeaStatus = "new" | "converted" | "archived";
export type IdeaSource = "dashboard" | "telegram";

/** Ідея з інбокса (рядок таблиці `idea_inbox`). */
export interface Idea {
  id: number;
  projectId: number | null;
  body: string;
  source: IdeaSource;
  status: IdeaStatus;
  runId: number | null;
  createdAt: string;
  /** Назва проєкту (join для UI). */
  projectName?: string;
}

/** Тіло запиту POST /api/ideas — додати ідею. */
export interface CreateIdeaRequest {
  body: string;
  projectId?: number | null;
  source?: IdeaSource;
}

// ──────────────────────────────── Налаштування акаунту ─────────────────────────

export type AiModel = "claude-sonnet-4-6" | "gemini-3-1-flash-lite";

export interface SettingsResponse {
  activeModel: AiModel;
}

export interface UpdateSettingsRequest {
  activeModel: AiModel;
}

