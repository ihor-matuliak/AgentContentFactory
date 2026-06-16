"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import type { ActivityEntry, AgentSummary, RunDetail, RunTask } from "@swarm/shared";
import { api } from "@/lib/api";
import { useProject } from "@/components/ProjectContext";
import { Markdown } from "@/components/Markdown";
import { CopyButton } from "@/components/CopyButton";
import { AgentBadge, ProgressBar, RunStatusBadge, TaskStatusBadge } from "@/components/ui";
import {
  ArrowLeftIcon,
  CoinIcon,
  PencilIcon,
  PlayIcon,
  PlusIcon,
  RotateIcon,
  SendIcon,
  TrashIcon,
} from "@/components/icons";

function timeShort(iso: string): string {
  return new Date(iso).toLocaleTimeString("uk-UA", { hour: "2-digit", minute: "2-digit" });
}

const ACTIVE_STATES = new Set(["planning", "running"]);

export default function RunDetailPage() {
  const project = useProject();
  const base = `/projects/${project.slug}`;
  const params = useParams<{ id: string }>();
  const id = params.id;
  const router = useRouter();

  const [data, setData] = useState<RunDetail | null>(null);
  const [agents, setAgents] = useState<AgentSummary[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [approving, setApproving] = useState(false);
  const [repeating, setRepeating] = useState(false);
  const [addingTask, setAddingTask] = useState(false);
  const loadedOnce = useRef(false);

  const refresh = useCallback(async () => {
    try {
      const detail = await api.getRun(id);
      setData(detail);
      loadedOnce.current = true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не вдалося завантажити прогін");
    }
  }, [id]);

  useEffect(() => {
    void refresh();
    api.listAgents().then(setAgents).catch(() => {});
    const t = setInterval(refresh, 3500);
    return () => clearInterval(t);
  }, [refresh]);

  const executors = agents.filter((a) => a.isActive && a.slug !== "strategist" && a.slug !== "critic");

  async function handleApprove() {
    setApproving(true);
    try {
      setData(await api.approvePlan(id));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не вдалося запустити прогін");
    } finally {
      setApproving(false);
    }
  }

  async function handleRepeat() {
    setRepeating(true);
    try {
      const run = await api.repeatRun(id);
      router.push(`${base}/runs/${run.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не вдалося повторити прогін");
      setRepeating(false);
    }
  }

  async function handleAddTask() {
    if (!data || executors.length === 0) return;
    setAddingTask(true);
    try {
      setData(
        await api.addTask(data.run.id, {
          description: "Нове завдання — опиши, що зробити",
          agentSlug: executors[0].slug,
        }),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не вдалося додати завдання");
    } finally {
      setAddingTask(false);
    }
  }

  if (error && !data) {
    return (
      <div className="px-6 py-10 md:px-10">
        <Link href={`${base}/runs`} className="text-[13px] text-[var(--color-honey)]">← До прогонів</Link>
        <p className="mt-4 text-[14px] text-[var(--color-danger)]">{error}</p>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="px-6 py-10 md:px-10">
        <div className="h-8 w-40 animate-pulse rounded bg-[var(--color-surface)]" />
        <div className="mt-4 h-24 animate-pulse rounded-[var(--radius-card)] bg-[var(--color-surface)]" />
      </div>
    );
  }

  const { run, tasks, activity } = data;
  const done = tasks.filter((t) => t.status === "done" || t.status === "approved").length;
  const isActive = ACTIVE_STATES.has(run.status);
  const editable = run.status === "awaiting_approval";

  return (
    <div className="px-6 py-7 md:px-10">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-[12px] text-[var(--color-fg-subtle)]">
          <Link href={`${base}/runs`} className="inline-flex items-center gap-1 hover:text-[var(--color-fg)]">
            <ArrowLeftIcon width={14} height={14} /> Прогони рою
          </Link>
          <span>/</span>
          <span className="font-mono">#{run.id}</span>
        </div>
        <button
          onClick={handleRepeat}
          disabled={repeating}
          className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--color-border)] px-3 py-1.5 text-[12.5px] text-[var(--color-fg-muted)] transition-colors hover:border-[var(--color-honey)]/40 hover:text-[var(--color-fg)] disabled:opacity-60"
        >
          <RotateIcon width={14} height={14} />
          {repeating ? "Повторюю…" : "Повторити прогін"}
        </button>
      </div>

      <div className="mt-3 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <h1 className="font-display text-[22px] font-semibold leading-snug tracking-tight md:text-[26px]">{run.goal}</h1>
          <div className="mt-2 flex items-center gap-3">
            <RunStatusBadge status={run.status} />
            {isActive && (
              <span className="inline-flex items-center gap-1.5 text-[12px] text-[var(--color-fg-subtle)]">
                <span className="h-1.5 w-1.5 animate-ping rounded-full bg-[var(--color-honey)]" /> рій працює…
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-2.5">
          <div className="text-right">
            <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-[var(--color-fg-subtle)]">
              <CoinIcon width={13} height={13} /> вартість
            </div>
            <div className="font-mono text-[15px] tabular text-[var(--color-honey)]">
              ${run.costUsd.toFixed(3)}
              {run.maxBudgetUsd != null && <span className="text-[var(--color-fg-subtle)]"> / ${run.maxBudgetUsd.toFixed(2)}</span>}
            </div>
          </div>
          <div className="h-8 w-px bg-[var(--color-border)]" />
          <div className="text-right">
            <div className="text-[11px] uppercase tracking-wide text-[var(--color-fg-subtle)]">токени</div>
            <div className="font-mono text-[15px] tabular text-[var(--color-fg-muted)]">
              {(run.inputTokens + run.outputTokens).toLocaleString("uk-UA")}
            </div>
          </div>
        </div>
      </div>

      {run.maxBudgetUsd != null && run.maxBudgetUsd > 0 && (
        <div className="mt-4 flex items-center gap-3">
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-[var(--color-surface-2)]">
            <div
              className="h-full rounded-full transition-all"
              style={{
                width: `${Math.min(100, (run.costUsd / run.maxBudgetUsd) * 100)}%`,
                backgroundColor: run.costUsd >= run.maxBudgetUsd ? "var(--color-danger)" : "var(--color-honey)",
              }}
            />
          </div>
          <span className="shrink-0 font-mono text-[11px] tabular text-[var(--color-fg-subtle)]">
            бюджет {Math.round((run.costUsd / run.maxBudgetUsd) * 100)}%
          </span>
        </div>
      )}

      {run.status === "failed" && run.error && (
        <div className="mt-5 rounded-xl border border-[var(--color-danger)]/30 bg-[var(--color-danger)]/10 px-4 py-3 text-[13px] text-[var(--color-danger)]">
          {run.error}
        </div>
      )}

      {editable && (
        <div className="mt-5 rounded-[var(--radius-card)] border border-[var(--color-honey)]/30 bg-gradient-to-br from-[var(--color-honey)]/[0.08] to-transparent p-5">
          <h2 className="font-display text-[16px] font-semibold">Стратег склав план — переглянь і за потреби відредагуй</h2>
          <p className="mt-1 text-[13px] text-[var(--color-fg-muted)]">
            Зміни опис чи виконавця завдань, додай або видали кроки. Коли план влаштовує — натисни «Запустити рій».
          </p>
          <button
            onClick={handleApprove}
            disabled={approving || tasks.length === 0}
            className="mt-4 inline-flex items-center gap-2 rounded-xl bg-[var(--color-honey)] px-5 py-2.5 text-[14px] font-semibold text-[var(--color-ink)] transition-colors hover:bg-[var(--color-honey-bright)] disabled:opacity-60"
          >
            <PlayIcon width={16} height={16} />
            {approving ? "Запускаю…" : "Запустити рій"}
          </button>
        </div>
      )}

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
        <section className="lg:col-span-2 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-[15px] font-semibold">Завдання · {tasks.length}</h2>
            <div className="w-40">
              <ProgressBar done={done} total={tasks.length} />
            </div>
          </div>

          {tasks.length === 0 && (
            <p className="rounded-[var(--radius-card)] border border-dashed border-[var(--color-border)] px-5 py-8 text-center text-[13px] text-[var(--color-fg-muted)]">
              {run.status === "planning" ? "Стратег розкладає ціль на завдання…" : "Завдань немає."}
            </p>
          )}

          {tasks.map((t) => (
            <TaskCard key={t.id} task={t} runId={run.id} editable={editable} executors={executors} onMutate={setData} />
          ))}

          {editable && executors.length > 0 && (
            <button
              onClick={handleAddTask}
              disabled={addingTask}
              className="flex w-full items-center justify-center gap-2 rounded-[var(--radius-card)] border border-dashed border-[var(--color-border-strong)] px-5 py-3 text-[13px] text-[var(--color-fg-muted)] transition-colors hover:border-[var(--color-honey)]/40 hover:text-[var(--color-fg)] disabled:opacity-60"
            >
              <PlusIcon width={15} height={15} /> Додати завдання
            </button>
          )}

          {run.summary && (
            <div className="rounded-[var(--radius-card)] border border-[var(--color-honey)]/25 bg-[var(--color-surface)] p-5">
              <div className="mb-3 flex items-center justify-between gap-3">
                <h3 className="flex items-center gap-2 font-display text-[15px] font-semibold text-[var(--color-honey)]">Зведення від Стратега</h3>
                <CopyButton text={run.summary} />
              </div>
              <Markdown>{run.summary}</Markdown>
            </div>
          )}
        </section>

        <section className="lg:col-span-1">
          <h2 className="mb-3 font-display text-[15px] font-semibold">Журнал рою</h2>
          <div className="rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-surface)]">
            {activity.length === 0 ? (
              <p className="px-4 py-6 text-center text-[13px] text-[var(--color-fg-muted)]">Поки порожньо.</p>
            ) : (
              <ul className="max-h-[640px] divide-y divide-[var(--color-border)] overflow-y-auto">
                {activity.map((a) => (
                  <ActivityRow key={a.id} entry={a} />
                ))}
              </ul>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

function TaskCard({
  task,
  runId,
  editable,
  executors,
  onMutate,
}: {
  task: RunTask;
  runId: number;
  editable: boolean;
  executors: AgentSummary[];
  onMutate: (detail: RunDetail) => void;
}) {
  const project = useProject();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(task.description);
  const [answer, setAnswer] = useState("");
  const [reworkComment, setReworkComment] = useState("");
  const [busy, setBusy] = useState(false);
  const name = task.agentName ?? task.agentSlug;
  // Зображення набору (ховаємо відхилені попередні спроби).
  const visualAssets = (task.generatedAssets ?? []).filter((a) => a.status !== "rejected");

  async function visualDecide(decision: "approve" | "rework") {
    setBusy(true);
    try {
      onMutate(
        await api.visualDecision(
          runId,
          task.id,
          project.id,
          decision,
          decision === "rework" ? reworkComment.trim() : undefined,
        ),
      );
      setReworkComment("");
    } finally {
      setBusy(false);
    }
  }

  async function saveEdit() {
    setBusy(true);
    try {
      onMutate(await api.updateTask(runId, task.id, { description: draft.trim() }));
      setEditing(false);
    } finally {
      setBusy(false);
    }
  }

  async function reassign(slug: string) {
    setBusy(true);
    try {
      onMutate(await api.updateTask(runId, task.id, { agentSlug: slug }));
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    try {
      onMutate(await api.deleteTask(runId, task.id));
    } finally {
      setBusy(false);
    }
  }

  async function sendAnswer() {
    if (!answer.trim()) return;
    setBusy(true);
    try {
      onMutate(await api.answerQuestion(runId, task.id, answer.trim()));
      setAnswer("");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
      <div className="flex items-start gap-3">
        <AgentBadge name={name} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-3">
            <span className="font-display text-[14px] font-semibold">{name}</span>
            <div className="flex items-center gap-2.5">
              {task.costUsd > 0 && (
                <span className="font-mono text-[10px] tabular text-[var(--color-fg-faint)]">${task.costUsd.toFixed(3)}</span>
              )}
              {task.revisionRound > 0 && (
                <span className="rounded-md bg-[var(--color-surface-2)] px-1.5 py-0.5 font-mono text-[10px] text-[var(--color-fg-subtle)]">
                  коло {task.revisionRound}
                </span>
              )}
              <TaskStatusBadge status={task.status} />
            </div>
          </div>

          {editing ? (
            <div className="mt-2">
              <textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                rows={2}
                className="w-full resize-none rounded-lg border border-[var(--color-border)] bg-[var(--color-base)] px-3 py-2 text-[13px] text-[var(--color-fg)] focus:border-[var(--color-honey)]/50 focus:outline-none"
              />
              <div className="mt-2 flex items-center gap-2">
                <button onClick={saveEdit} disabled={busy} className="rounded-lg bg-[var(--color-honey)] px-3 py-1.5 text-[12px] font-semibold text-[var(--color-ink)] disabled:opacity-60">
                  Зберегти
                </button>
                <button
                  onClick={() => {
                    setDraft(task.description);
                    setEditing(false);
                  }}
                  className="rounded-lg border border-[var(--color-border)] px-3 py-1.5 text-[12px] text-[var(--color-fg-muted)]"
                >
                  Скасувати
                </button>
              </div>
            </div>
          ) : (
            <p className="mt-1 text-[13px] leading-relaxed text-[var(--color-fg-muted)]">{task.description}</p>
          )}

          {editable && !editing && (
            <div className="mt-2.5 flex flex-wrap items-center gap-2">
              <select
                value={task.agentSlug}
                disabled={busy}
                onChange={(e) => reassign(e.target.value)}
                className="rounded-lg border border-[var(--color-border)] bg-[var(--color-base)] px-2.5 py-1.5 text-[12px] text-[var(--color-fg-muted)] focus:border-[var(--color-honey)]/50 focus:outline-none"
              >
                {executors.map((a) => (
                  <option key={a.slug} value={a.slug}>{a.name}</option>
                ))}
              </select>
              <button onClick={() => setEditing(true)} className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--color-border)] px-2.5 py-1.5 text-[12px] text-[var(--color-fg-muted)] transition-colors hover:text-[var(--color-fg)]">
                <PencilIcon width={13} height={13} /> Редагувати
              </button>
              <button onClick={remove} disabled={busy} className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--color-border)] px-2.5 py-1.5 text-[12px] text-[var(--color-fg-muted)] transition-colors hover:border-[var(--color-danger)]/40 hover:text-[var(--color-danger)] disabled:opacity-60">
                <TrashIcon width={13} height={13} /> Видалити
              </button>
            </div>
          )}

          {task.status === "waiting_question" && task.question && (
            <div className="mt-2.5 rounded-lg border border-[var(--color-honey)]/30 bg-[var(--color-honey)]/[0.07] p-3">
              <p className="text-[12.5px] text-[var(--color-fg-muted)]">
                <span className="font-medium text-[var(--color-honey)]">Питання:</span> {task.question}
              </p>
              <div className="mt-2 flex items-end gap-2">
                <textarea
                  value={answer}
                  onChange={(e) => setAnswer(e.target.value)}
                  rows={2}
                  placeholder="Твоя відповідь виконавцю…"
                  className="flex-1 resize-none rounded-lg border border-[var(--color-border)] bg-[var(--color-base)] px-3 py-2 text-[13px] text-[var(--color-fg)] placeholder:text-[var(--color-fg-subtle)] focus:border-[var(--color-honey)]/50 focus:outline-none"
                />
                <button onClick={sendAnswer} disabled={busy || !answer.trim()} aria-label="Надіслати відповідь" className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-[var(--color-honey)] text-[var(--color-ink)] transition-colors hover:bg-[var(--color-honey-bright)] disabled:opacity-60">
                  <SendIcon width={16} height={16} />
                </button>
              </div>
            </div>
          )}

          {task.criticVerdict && (
            <div
              className={[
                "mt-2.5 rounded-lg border px-3 py-2 text-[12.5px]",
                task.criticVerdict === "approved"
                  ? "border-[var(--color-online)]/25 bg-[var(--color-online)]/[0.07] text-[var(--color-fg-muted)]"
                  : "border-[var(--color-busy)]/25 bg-[var(--color-busy)]/[0.07] text-[var(--color-fg-muted)]",
              ].join(" ")}
            >
              <span className="font-medium" style={{ color: task.criticVerdict === "approved" ? "var(--color-online)" : "var(--color-busy)" }}>
                Критик: {task.criticVerdict === "approved" ? "схвалено" : "на доопрацювання"}
              </span>
              {task.criticComment && <> — {task.criticComment}</>}
            </div>
          )}

          {task.ownerFeedback && (
            <div className="mt-2 rounded-lg border border-[var(--color-info)]/25 bg-[var(--color-info)]/[0.07] px-3 py-2 text-[12.5px] text-[var(--color-fg-muted)]">
              <span className="font-medium text-[var(--color-info)]">Твій коментар:</span> {task.ownerFeedback}
            </div>
          )}

          {/* Згенерований візуал: стрічка зображень. */}
          {visualAssets.length > 0 && (
            <div className="mt-3">
              <div className="flex gap-2.5 overflow-x-auto pb-1">
                {visualAssets.map((a) => (
                  <a
                    key={a.id}
                    href={`${api.backendUrl}${a.url}`}
                    target="_blank"
                    rel="noreferrer"
                    className="block shrink-0"
                    title="Відкрити в новій вкладці"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={`${api.backendUrl}${a.url}`}
                      alt={`Згенероване зображення ${a.ordinal + 1}`}
                      loading="lazy"
                      className="h-36 w-auto rounded-lg border border-[var(--color-border)] object-cover"
                    />
                  </a>
                ))}
              </div>
            </div>
          )}

          {/* Гейт схвалення візуалу (пауза посеред прогону). */}
          {task.status === "awaiting_approval" && (
            <div className="mt-3 rounded-lg border border-[var(--color-honey)]/30 bg-[var(--color-honey)]/[0.07] p-3">
              <p className="text-[12.5px] font-medium text-[var(--color-honey)]">
                Візуал на твоє схвалення — рій на паузі.
              </p>
              <textarea
                value={reworkComment}
                onChange={(e) => setReworkComment(e.target.value)}
                rows={2}
                placeholder="Коментар для доопрацювання (напр. «обкладинку темнішою, додай людину в кадрі»)"
                className="mt-2.5 w-full resize-none rounded-lg border border-[var(--color-border)] bg-[var(--color-base)] px-3 py-2 text-[13px] text-[var(--color-fg)] placeholder:text-[var(--color-fg-subtle)] focus:border-[var(--color-honey)]/50 focus:outline-none"
              />
              <div className="mt-2.5 flex flex-wrap items-center gap-2">
                <button
                  onClick={() => visualDecide("approve")}
                  disabled={busy}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--color-online)] px-3.5 py-2 text-[13px] font-semibold text-[var(--color-ink)] transition-opacity hover:opacity-90 disabled:opacity-60"
                >
                  ✓ Схвалити — рій рухається далі
                </button>
                <button
                  onClick={() => visualDecide("rework")}
                  disabled={busy}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--color-border-strong)] px-3.5 py-2 text-[13px] font-medium text-[var(--color-honey)] transition-colors hover:bg-[var(--color-honey)]/10 disabled:opacity-60"
                >
                  <RotateIcon width={14} height={14} /> На доопрацювання
                </button>
              </div>
            </div>
          )}

          {task.result && (
            <div className="mt-3">
              <div className="flex items-center gap-3">
                <button onClick={() => setOpen((v) => !v)} className="text-[12px] font-medium text-[var(--color-honey)] hover:text-[var(--color-honey-bright)]">
                  {open ? "Згорнути результат ↑" : "Показати результат ↓"}
                </button>
                <CopyButton text={task.result} />
              </div>
              {open && (
                <div className="mt-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-base)] p-4">
                  <Markdown>{task.result}</Markdown>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ActivityRow({ entry }: { entry: ActivityEntry }) {
  return (
    <li className="flex gap-3 px-4 py-3">
      <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--color-honey)]/70" />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-[12.5px]">
            <span className="font-medium text-[var(--color-fg)]">{entry.actor}</span>{" "}
            <span className="text-[var(--color-fg-muted)]">{entry.action}</span>
          </span>
          <span className="shrink-0 font-mono text-[10px] text-[var(--color-fg-subtle)]">{timeShort(entry.createdAt)}</span>
        </div>
        {entry.detail && <p className="mt-0.5 line-clamp-2 text-[12px] text-[var(--color-fg-subtle)]">{entry.detail}</p>}
      </div>
    </li>
  );
}
