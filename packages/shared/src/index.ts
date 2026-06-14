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
