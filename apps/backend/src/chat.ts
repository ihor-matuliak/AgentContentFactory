import type { Agent, ChatMessage, ChatResponse } from "@swarm/shared";
import { query } from "./db.js";
import { getChatHandler } from "./agents/handlers.js";

/**
 * Спільний рушій чату з агентом (Фаза 5).
 *
 * Чати скоуплені проєктом: історія й нові повідомлення фільтруються за
 * (agent_id, project_id). Цю функцію використовують і HTTP-роут /api/agents,
 * і двосторонній Telegram.
 */

interface AgentRow {
  id: number;
  slug: string;
  name: string;
  role: string;
  system_prompt: string;
  status: Agent["status"];
  is_active: boolean;
}

interface ChatRow {
  id: number;
  agent_id: number;
  project_id: number;
  role: ChatMessage["role"];
  content: string;
  created_at: Date;
}

function toAgent(row: AgentRow): Agent {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    role: row.role,
    systemPrompt: row.system_prompt,
    status: row.status,
    isActive: row.is_active,
  };
}

function toChatMessage(row: ChatRow): ChatMessage {
  return {
    id: row.id,
    agentId: row.agent_id,
    projectId: row.project_id,
    role: row.role,
    content: row.content,
    createdAt: row.created_at.toISOString(),
  };
}

export async function findAgentBySlug(slug: string): Promise<Agent | null> {
  const { rows } = await query<AgentRow>(
    "SELECT * FROM agents WHERE slug = $1 LIMIT 1",
    [slug],
  );
  return rows[0] ? toAgent(rows[0]) : null;
}

export async function loadHistory(
  agentId: number,
  projectId: number,
): Promise<ChatMessage[]> {
  const { rows } = await query<ChatRow>(
    `SELECT * FROM chat_messages
     WHERE agent_id = $1 AND project_id = $2
     ORDER BY created_at ASC, id ASC`,
    [agentId, projectId],
  );
  return rows.map(toChatMessage);
}

export async function insertMessage(
  agentId: number,
  projectId: number,
  role: ChatMessage["role"],
  content: string,
): Promise<ChatMessage> {
  const { rows } = await query<ChatRow>(
    `INSERT INTO chat_messages (agent_id, project_id, role, content)
     VALUES ($1, $2, $3, $4) RETURNING *`,
    [agentId, projectId, role, content],
  );
  return toChatMessage(rows[0]);
}

/**
 * Надсилає повідомлення агенту в межах проєкту й повертає збережені
 * повідомлення (користувача + відповідь агента).
 */
export async function chatWithAgent(
  agent: Agent,
  projectId: number,
  message: string,
): Promise<ChatResponse> {
  const history = await loadHistory(agent.id, projectId);
  const userMessage = await insertMessage(agent.id, projectId, "user", message);
  const handler = getChatHandler(agent.slug);
  const replyText = await handler(agent, history, message, projectId);
  const reply = await insertMessage(agent.id, projectId, "assistant", replyText);
  return { userMessage, reply };
}
