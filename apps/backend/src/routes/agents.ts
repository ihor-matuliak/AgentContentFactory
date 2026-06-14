import { Router } from "express";
import type {
  Agent,
  AgentSummary,
  ChatMessage,
  ChatRequest,
  ChatResponse,
} from "@swarm/shared";
import { query } from "../db.js";
import { getChatHandler } from "../agents/handlers.js";

export const agentsRouter = Router();

/** Рядок таблиці agents (snake_case з БД). */
interface AgentRow {
  id: number;
  slug: string;
  name: string;
  role: string;
  system_prompt: string;
  status: Agent["status"];
  is_active: boolean;
}

/** Рядок таблиці chat_messages. */
interface ChatRow {
  id: number;
  agent_id: number;
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
    role: row.role,
    content: row.content,
    createdAt: row.created_at.toISOString(),
  };
}

async function findAgentBySlug(slug: string): Promise<Agent | null> {
  const { rows } = await query<AgentRow>(
    "SELECT * FROM agents WHERE slug = $1 LIMIT 1",
    [slug],
  );
  return rows[0] ? toAgent(rows[0]) : null;
}

async function loadHistory(agentId: number): Promise<ChatMessage[]> {
  const { rows } = await query<ChatRow>(
    "SELECT * FROM chat_messages WHERE agent_id = $1 ORDER BY created_at ASC, id ASC",
    [agentId],
  );
  return rows.map(toChatMessage);
}

async function insertMessage(
  agentId: number,
  role: ChatMessage["role"],
  content: string,
): Promise<ChatMessage> {
  const { rows } = await query<ChatRow>(
    "INSERT INTO chat_messages (agent_id, role, content) VALUES ($1, $2, $3) RETURNING *",
    [agentId, role, content],
  );
  return toChatMessage(rows[0]);
}

/** GET /api/agents — список агентів (без системних промптів). */
agentsRouter.get("/", async (_req, res) => {
  const { rows } = await query<AgentRow>(
    "SELECT * FROM agents ORDER BY id ASC",
  );
  const agents: AgentSummary[] = rows.map(toAgent).map(({ systemPrompt: _omit, ...rest }) => rest);
  res.json(agents);
});

/** GET /api/agents/:slug/messages — історія чату з агентом. */
agentsRouter.get("/:slug/messages", async (req, res) => {
  const agent = await findAgentBySlug(req.params.slug);
  if (!agent) {
    res.status(404).json({ error: "Агента не знайдено" });
    return;
  }
  const history = await loadHistory(agent.id);
  res.json(history);
});

/** POST /api/agents/:slug/chat — надіслати повідомлення агенту й отримати відповідь. */
agentsRouter.post("/:slug/chat", async (req, res) => {
  const agent = await findAgentBySlug(req.params.slug);
  if (!agent) {
    res.status(404).json({ error: "Агента не знайдено" });
    return;
  }

  const body = req.body as Partial<ChatRequest>;
  const message = typeof body.message === "string" ? body.message.trim() : "";
  if (!message) {
    res.status(400).json({ error: "Поле message обов'язкове" });
    return;
  }

  try {
    const history = await loadHistory(agent.id);
    const userMessage = await insertMessage(agent.id, "user", message);

    const handler = getChatHandler(agent.slug);
    const replyText = await handler(agent, history, message);
    const reply = await insertMessage(agent.id, "assistant", replyText);

    const response: ChatResponse = { userMessage, reply };
    res.json(response);
  } catch (err) {
    console.error("Помилка під час спілкування з агентом:", err);
    const detail = err instanceof Error ? err.message : "Невідома помилка";
    res.status(502).json({ error: `Не вдалося отримати відповідь агента: ${detail}` });
  }
});
