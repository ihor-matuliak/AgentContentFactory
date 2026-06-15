import type {
  AddTaskRequest,
  AgentSummary,
  AuthStatusResponse,
  BoardTask,
  ChatMessage,
  ChatResponse,
  ContentDraft,
  ContentPlanItem,
  HealthResponse,
  Platform,
  ProjectProfile,
  Run,
  RunDetail,
  RunSize,
  RunSummary,
  ReviewItem,
  SaveProfileRequest,
  SwarmEvent,
  TaskStatus,
  UpdateTaskRequest,
} from "@swarm/shared";

const BACKEND_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:4000";

const PASSWORD_KEY = "swarm_password";

/** Пароль доступу зберігається локально й шлеться заголовком x-swarm-password. */
function storedPassword(): string {
  if (typeof window === "undefined") return "";
  return window.localStorage.getItem(PASSWORD_KEY) ?? "";
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const pw = storedPassword();
  const res = await fetch(`${BACKEND_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(pw ? { "x-swarm-password": pw } : {}),
      ...init?.headers,
    },
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
    const err = new Error(detail) as Error & { status?: number };
    err.status = res.status;
    throw err;
  }

  return res.json() as Promise<T>;
}

export const api = {
  backendUrl: BACKEND_URL,

  // ── Авторизація ──

  setPassword(pw: string): void {
    if (typeof window === "undefined") return;
    if (pw) window.localStorage.setItem(PASSWORD_KEY, pw);
    else window.localStorage.removeItem(PASSWORD_KEY);
  },
  hasPassword(): boolean {
    return storedPassword() !== "";
  },
  authStatus(): Promise<AuthStatusResponse> {
    return request<AuthStatusResponse>("/api/auth");
  },
  login(password: string): Promise<{ ok: boolean }> {
    return request<{ ok: boolean }>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ password }),
    });
  },

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

  // ── Прогони рою ──

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

  repeatRun(id: number | string): Promise<Run> {
    return request<Run>(`/api/runs/${id}/repeat`, { method: "POST" });
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

  answerQuestion(runId: number, taskId: number, answer: string): Promise<RunDetail> {
    return request<RunDetail>(`/api/runs/${runId}/tasks/${taskId}/answer`, {
      method: "POST",
      body: JSON.stringify({ answer }),
    });
  },

  addTask(runId: number, task: AddTaskRequest): Promise<RunDetail> {
    return request<RunDetail>(`/api/runs/${runId}/tasks`, {
      method: "POST",
      body: JSON.stringify(task),
    });
  },

  updateTask(
    runId: number,
    taskId: number,
    patch: UpdateTaskRequest,
  ): Promise<RunDetail> {
    return request<RunDetail>(`/api/runs/${runId}/tasks/${taskId}`, {
      method: "PATCH",
      body: JSON.stringify(patch),
    });
  },

  setTaskStatus(runId: number, taskId: number, status: TaskStatus): Promise<RunDetail> {
    return this.updateTask(runId, taskId, { status });
  },

  deleteTask(runId: number, taskId: number): Promise<RunDetail> {
    return request<RunDetail>(`/api/runs/${runId}/tasks/${taskId}`, {
      method: "DELETE",
    });
  },

  listReview(): Promise<ReviewItem[]> {
    return request<ReviewItem[]>("/api/runs/review");
  },

  // ── Фабрика контенту ──

  listBoard(): Promise<BoardTask[]> {
    return request<BoardTask[]>("/api/content/board");
  },

  listDrafts(): Promise<ContentDraft[]> {
    return request<ContentDraft[]>("/api/content/drafts");
  },

  listPlan(): Promise<ContentPlanItem[]> {
    return request<ContentPlanItem[]>("/api/content/plan");
  },

  createPlanItem(item: {
    title: string;
    platform: Platform;
    scheduledFor?: string | null;
    notes?: string;
  }): Promise<ContentPlanItem> {
    return request<ContentPlanItem>("/api/content/plan", {
      method: "POST",
      body: JSON.stringify(item),
    });
  },

  updatePlanItem(
    id: number,
    patch: Partial<{
      title: string;
      platform: Platform;
      notes: string;
      scheduledFor: string | null;
      status: "planned" | "published";
    }>,
  ): Promise<ContentPlanItem> {
    return request<ContentPlanItem>(`/api/content/plan/${id}`, {
      method: "PATCH",
      body: JSON.stringify(patch),
    });
  },

  deletePlanItem(id: number): Promise<{ ok: boolean }> {
    return request<{ ok: boolean }>(`/api/content/plan/${id}`, {
      method: "DELETE",
    });
  },

  // ── Профіль ──

  getProfile(): Promise<ProjectProfile> {
    return request<ProjectProfile>("/api/profile");
  },

  saveProfile(data: SaveProfileRequest): Promise<ProjectProfile> {
    return request<ProjectProfile>("/api/profile", {
      method: "PUT",
      body: JSON.stringify(data),
    });
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
