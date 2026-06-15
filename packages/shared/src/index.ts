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
  | "draft_created";

/** Прогін рою (рядок таблиці `runs`). */
export interface Run {
  id: number;
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
  createdAt: string;
  updatedAt: string;
}

/** Сповіщення для власника (рядок таблиці `events`). */
export interface SwarmEvent {
  id: number;
  runId: number | null;
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
  goal: string;
  /** Якщо не задано — розмір визначає Стратег під час планування. */
  size?: RunSize;
  /** Необов'язковий ліміт витрат на прогін, USD. */
  maxBudgetUsd?: number;
}

/** Тіло запиту POST /api/runs/:id/tasks/:taskId/review. */
export interface ReviewDecisionRequest {
  decision: "approve" | "rework";
  comment?: string;
}

// ──────────────────────────── Фаза 4: фабрика контенту ───────────────────────

/** Майданчик публікації. */
export type Platform = "youtube" | "telegram" | "instagram" | "other";

/** Профіль проєкту — єдиний бренд-контекст (рядок таблиці `project_profile`). */
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
  updatedAt: string;
}

/** Тіло запиту PUT /api/profile. */
export type SaveProfileRequest = Omit<ProjectProfile, "updatedAt">;

/** Статус чернетки контенту. */
export type DraftStatus = "draft" | "scheduled" | "published";

/** Чернетка контенту (рядок таблиці `content_drafts`). */
export interface ContentDraft {
  id: number;
  runId: number | null;
  taskId: number | null;
  agentSlug: string;
  platform: Platform;
  title: string;
  body: string;
  status: DraftStatus;
  createdAt: string;
  updatedAt: string;
}

/** Статус елемента контент-плану. */
export type ContentPlanStatus = "planned" | "published";

/** Елемент контент-плану (рядок таблиці `content_plan`). */
export interface ContentPlanItem {
  id: number;
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
