import type {
  AddTaskRequest,
  AgentSummary,
  AuthStatusResponse,
  BoardTask,
  ChatMessage,
  ChatResponse,
  ContentDraft,
  ContentPlanItem,
  CreateProjectRequest,
  HealthResponse,
  Idea,
  IngestResult,
  KnowledgeListResponse,
  KnowledgeSearchHit,
  KnowledgeSourceType,
  UploadResult,
  Platform,
  Project,
  ProjectProfile,
  ProjectSummary,
  Run,
  RunDetail,
  RunSize,
  RunSummary,
  ReviewItem,
  SaveProfileRequest,
  SettingsResponse,
  SwarmEvent,
  TaskStatus,
  TestsOverview,
  TestScenario,
  UpdateTaskRequest,
  UpdateSettingsRequest,
} from "@swarm/shared";

const BACKEND_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:4000";

const PASSWORD_KEY = "swarm_password";

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

/** Додає ?projectId=N до шляху. */
function withProject(path: string, projectId: number): string {
  const sep = path.includes("?") ? "&" : "?";
  return `${path}${sep}projectId=${projectId}`;
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

  // ── Проєкти (Фаза 5) ──

  listProjects(): Promise<ProjectSummary[]> {
    return request<ProjectSummary[]>("/api/projects");
  },
  getProject(slug: string): Promise<Project> {
    return request<Project>(`/api/projects/${slug}`);
  },
  createProject(data: CreateProjectRequest): Promise<Project> {
    return request<Project>("/api/projects", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },

  // ── Агенти та чати (скоуплені проєктом) ──

  listAgents(): Promise<AgentSummary[]> {
    return request<AgentSummary[]>("/api/agents");
  },

  getHistory(slug: string, projectId: number): Promise<ChatMessage[]> {
    return request<ChatMessage[]>(withProject(`/api/agents/${slug}/messages`, projectId));
  },

  sendMessage(slug: string, message: string, projectId: number): Promise<ChatResponse> {
    return request<ChatResponse>(`/api/agents/${slug}/chat`, {
      method: "POST",
      body: JSON.stringify({ message, projectId }),
    });
  },

  // ── Прогони рою ──

  createRun(projectId: number, goal: string, size?: RunSize, maxBudgetUsd?: number): Promise<Run> {
    return request<Run>("/api/runs", {
      method: "POST",
      body: JSON.stringify({ projectId, goal, size, maxBudgetUsd }),
    });
  },

  /** Пряме (solo) завдання конкретному агенту, оминаючи планування. */
  soloTask(projectId: number, agentSlug: string, goal: string): Promise<Run> {
    return request<Run>("/api/runs/solo", {
      method: "POST",
      body: JSON.stringify({ projectId, agentSlug, goal }),
    });
  },

  listRuns(projectId: number): Promise<RunSummary[]> {
    return request<RunSummary[]>(withProject("/api/runs", projectId));
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

  updateTask(runId: number, taskId: number, patch: UpdateTaskRequest): Promise<RunDetail> {
    return request<RunDetail>(`/api/runs/${runId}/tasks/${taskId}`, {
      method: "PATCH",
      body: JSON.stringify(patch),
    });
  },

  setTaskStatus(runId: number, taskId: number, status: TaskStatus): Promise<RunDetail> {
    return this.updateTask(runId, taskId, { status });
  },

  deleteTask(runId: number, taskId: number): Promise<RunDetail> {
    return request<RunDetail>(`/api/runs/${runId}/tasks/${taskId}`, { method: "DELETE" });
  },

  listReview(projectId: number): Promise<ReviewItem[]> {
    return request<ReviewItem[]>(withProject("/api/runs/review", projectId));
  },

  // ── Фабрика контенту ──

  listBoard(projectId: number): Promise<BoardTask[]> {
    return request<BoardTask[]>(withProject("/api/content/board", projectId));
  },

  listDrafts(projectId: number): Promise<ContentDraft[]> {
    return request<ContentDraft[]>(withProject("/api/content/drafts", projectId));
  },

  listPlan(projectId: number): Promise<ContentPlanItem[]> {
    return request<ContentPlanItem[]>(withProject("/api/content/plan", projectId));
  },

  createPlanItem(
    projectId: number,
    item: { title: string; platform: Platform; scheduledFor?: string | null; notes?: string },
  ): Promise<ContentPlanItem> {
    return request<ContentPlanItem>(withProject("/api/content/plan", projectId), {
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
    return request<{ ok: boolean }>(`/api/content/plan/${id}`, { method: "DELETE" });
  },

  publishToTelegram(planId: number): Promise<{ ok: boolean }> {
    return request<{ ok: boolean }>(`/api/content-plan/${planId}/publish/telegram`, {
      method: "POST",
    });
  },

  // ── Профіль (пер-проєкт) ──

  getProfile(projectId: number): Promise<ProjectProfile> {
    return request<ProjectProfile>(withProject("/api/profile", projectId));
  },

  saveProfile(projectId: number, data: SaveProfileRequest): Promise<ProjectProfile> {
    return request<ProjectProfile>(withProject("/api/profile", projectId), {
      method: "PUT",
      body: JSON.stringify(data),
    });
  },

  // ── База знань ──

  listKnowledge(
    projectId: number,
    sourceType?: KnowledgeSourceType,
  ): Promise<KnowledgeListResponse> {
    const path = sourceType
      ? `/api/knowledge?sourceType=${sourceType}`
      : "/api/knowledge";
    return request<KnowledgeListResponse>(withProject(path, projectId));
  },
  searchKnowledge(projectId: number, q: string): Promise<KnowledgeSearchHit[]> {
    return request<KnowledgeSearchHit[]>(
      withProject(`/api/knowledge/search?q=${encodeURIComponent(q)}`, projectId),
    );
  },
  /** Завантаження файлів (multipart). Документи індексуються, зображення — зберігаються. */
  async uploadKnowledge(
    projectId: number,
    files: File[],
    sourceType: KnowledgeSourceType,
    visibleToAgents: string[],
  ): Promise<UploadResult> {
    const form = new FormData();
    for (const f of files) form.append("files", f);
    form.append("source_type", sourceType);
    form.append("visible_to_agents", JSON.stringify(visibleToAgents));
    const pw = storedPassword();
    const res = await fetch(`${BACKEND_URL}${withProject("/api/knowledge", projectId)}`, {
      method: "POST",
      body: form, // НЕ задаємо Content-Type — браузер додасть boundary сам.
      headers: pw ? { "x-swarm-password": pw } : undefined,
      cache: "no-store",
    });
    if (!res.ok) {
      let detail = res.statusText;
      try {
        const b = (await res.json()) as { error?: string };
        if (b.error) detail = b.error;
      } catch {
        /* лишаємо statusText */
      }
      throw new Error(detail);
    }
    return res.json() as Promise<UploadResult>;
  },
  ingestText(projectId: number, text: string, title?: string): Promise<IngestResult> {
    return request<IngestResult>(withProject("/api/knowledge/ingest", projectId), {
      method: "POST",
      body: JSON.stringify({ text, title }),
    });
  },
  ingestDir(projectId: number, dir: string): Promise<IngestResult> {
    return request<IngestResult>(withProject("/api/knowledge/ingest", projectId), {
      method: "POST",
      body: JSON.stringify({ dir }),
    });
  },
  deleteKnowledge(projectId: number, id: number): Promise<{ ok: boolean }> {
    return request<{ ok: boolean }>(withProject(`/api/knowledge/${id}`, projectId), {
      method: "DELETE",
    });
  },

  // ── Інбокс ідей ──

  listIdeas(): Promise<Idea[]> {
    return request<Idea[]>("/api/ideas");
  },
  createIdea(body: string, projectId?: number | null): Promise<Idea> {
    return request<Idea>("/api/ideas", {
      method: "POST",
      body: JSON.stringify({ body, projectId }),
    });
  },
  convertIdea(id: number, projectId?: number): Promise<Run> {
    return request<Run>(`/api/ideas/${id}/convert`, {
      method: "POST",
      body: JSON.stringify({ projectId }),
    });
  },
  archiveIdea(id: number): Promise<{ ok: boolean }> {
    return request<{ ok: boolean }>(`/api/ideas/${id}/archive`, { method: "POST" });
  },

  // ── Фабрика тестів ──

  getTests(): Promise<TestsOverview> {
    return request<TestsOverview>("/api/tests");
  },
  listScenarios(): Promise<TestScenario[]> {
    return request<TestScenario[]>("/api/tests/scenarios");
  },
  seedTests(): Promise<{ seeded: number }> {
    return request<{ seeded: number }>("/api/tests/seed", { method: "POST" });
  },
  batchTests(limit: number): Promise<{ ran: number }> {
    return request<{ ran: number }>("/api/tests/batch", {
      method: "POST",
      body: JSON.stringify({ limit }),
    });
  },

  // ── Сповіщення (скоуплені проєктом) ──

  listEvents(projectId: number): Promise<{ items: SwarmEvent[]; unread: number }> {
    return request<{ items: SwarmEvent[]; unread: number }>(withProject("/api/events", projectId));
  },

  unreadCount(projectId: number): Promise<{ unread: number }> {
    return request<{ unread: number }>(withProject("/api/events/unread-count", projectId));
  },

  markAllEventsRead(projectId: number): Promise<{ unread: number }> {
    return request<{ unread: number }>(withProject("/api/events/read-all", projectId), {
      method: "POST",
    });
  },

  // ── Налаштування акаунту ──

  getSettings(): Promise<SettingsResponse> {
    return request<SettingsResponse>("/api/account/settings");
  },

  updateSettings(data: UpdateSettingsRequest): Promise<SettingsResponse> {
    return request<SettingsResponse>("/api/account/settings", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },
};
