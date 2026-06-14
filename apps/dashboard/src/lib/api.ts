import type {
  AgentSummary,
  ChatMessage,
  ChatResponse,
  HealthResponse,
  Run,
  RunDetail,
  RunSize,
  RunSummary,
  ReviewItem,
  SwarmEvent,
} from "@swarm/shared";

const BACKEND_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:4000";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BACKEND_URL}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
    cache: "no-store",
  });

  if (!res.ok) {
    let detail = res.statusText;
    try {
      const body = (await res.json()) as { error?: string };
      if (body.error) detail = body.error;
    } catch {
      // тіло не JSON — лишаємо statusText
    }
    throw new Error(detail);
  }

  return res.json() as Promise<T>;
}

export const api = {
  backendUrl: BACKEND_URL,

  health(): Promise<HealthResponse> {
    return request<HealthResponse>("/api/health");
  },

  listAgents(): Promise<AgentSummary[]> {
    return request<AgentSummary[]>("/api/agents");
  },

  getHistory(slug: string): Promise<ChatMessage[]> {
    return request<ChatMessage[]>(`/api/agents/${slug}/messages`);
  },

  sendMessage(slug: string, message: string): Promise<ChatResponse> {
    return request<ChatResponse>(`/api/agents/${slug}/chat`, {
      method: "POST",
      body: JSON.stringify({ message }),
    });
  },

  // ── Прогони рою (Фаза 3) ──

  createRun(goal: string, size?: RunSize, maxBudgetUsd?: number): Promise<Run> {
    return request<Run>("/api/runs", {
      method: "POST",
      body: JSON.stringify({ goal, size, maxBudgetUsd }),
    });
  },

  listRuns(): Promise<RunSummary[]> {
    return request<RunSummary[]>("/api/runs");
  },

  getRun(id: number | string): Promise<RunDetail> {
    return request<RunDetail>(`/api/runs/${id}`);
  },

  approvePlan(id: number | string): Promise<RunDetail> {
    return request<RunDetail>(`/api/runs/${id}/approve`, { method: "POST" });
  },

  reviewTask(
    runId: number,
    taskId: number,
    decision: "approve" | "rework",
    comment?: string,
  ): Promise<RunDetail> {
    return request<RunDetail>(`/api/runs/${runId}/tasks/${taskId}/review`, {
      method: "POST",
      body: JSON.stringify({ decision, comment }),
    });
  },

  listReview(): Promise<ReviewItem[]> {
    return request<ReviewItem[]>("/api/runs/review");
  },

  // ── Сповіщення ──

  listEvents(): Promise<{ items: SwarmEvent[]; unread: number }> {
    return request<{ items: SwarmEvent[]; unread: number }>("/api/events");
  },

  unreadCount(): Promise<{ unread: number }> {
    return request<{ unread: number }>("/api/events/unread-count");
  },

  markAllEventsRead(): Promise<{ unread: number }> {
    return request<{ unread: number }>("/api/events/read-all", { method: "POST" });
  },
};
