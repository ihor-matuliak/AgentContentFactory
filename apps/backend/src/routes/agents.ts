import { Router } from "express";
import type { Agent, AgentSummary } from "@swarm/shared";
import { query } from "../db.js";
import { chatWithAgent, findAgentBySlug, loadHistory } from "../chat.js";
import { getProjectById } from "../projects.js";

export const agentsRouter = Router();

interface AgentRow {
  id: number;
  slug: string;
  name: string;
  role: string;
  system_prompt: string;
  status: Agent["status"];
  is_active: boolean;
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

/** Розбирає й валідує projectId із query/тіла. */
async function resolveProjectId(value: unknown): Promise<number | null> {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) return null;
  const project = await getProjectById(id);
  return project ? id : null;
}

/** GET /api/agents — список агентів (без системних промптів). Спільні для всіх проєктів. */
agentsRouter.get("/", async (_req, res) => {
  const { rows } = await query<AgentRow>("SELECT * FROM agents ORDER BY id ASC");
  const agents: AgentSummary[] = rows
    .map(toAgent)
    .map(({ systemPrompt: _omit, ...rest }) => rest);
  res.json(agents);
});

/** GET /api/agents/:slug/messages?projectId=N — історія чату в межах проєкту. */
agentsRouter.get("/:slug/messages", async (req, res) => {
  const agent = await findAgentBySlug(req.params.slug);
  if (!agent) {
    res.status(404).json({ error: "Агента не знайдено" });
    return;
  }
  const projectId = await resolveProjectId(req.query.projectId);
  if (projectId === null) {
    res.status(400).json({ error: "Потрібен валідний projectId" });
    return;
  }
  res.json(await loadHistory(agent.id, projectId));
});

/** POST /api/agents/:slug/chat — надіслати повідомлення агенту в межах проєкту. */
agentsRouter.post("/:slug/chat", async (req, res) => {
  const agent = await findAgentBySlug(req.params.slug);
  if (!agent) {
    res.status(404).json({ error: "Агента не знайдено" });
    return;
  }
  const body = req.body as { message?: unknown; projectId?: unknown };
  const projectId = await resolveProjectId(body.projectId);
  if (projectId === null) {
    res.status(400).json({ error: "Потрібен валідний projectId" });
    return;
  }
  const message = typeof body.message === "string" ? body.message.trim() : "";
  if (!message) {
    res.status(400).json({ error: "Поле message обов'язкове" });
    return;
  }

  try {
    res.json(await chatWithAgent(agent, projectId, message));
  } catch (err) {
    console.error("Помилка під час спілкування з агентом:", err);
    const detail = err instanceof Error ? err.message : "Невідома помилка";
    res.status(502).json({ error: `Не вдалося отримати відповідь агента: ${detail}` });
  }
});
