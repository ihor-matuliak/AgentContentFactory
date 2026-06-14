"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import type { ActivityEntry, RunDetail, RunTask } from "@swarm/shared";
import { api } from "@/lib/api";
import { Markdown } from "@/components/Markdown";
import {
  AgentBadge,
  ProgressBar,
  RunStatusBadge,
  TaskStatusBadge,
} from "@/components/ui";
import { ArrowLeftIcon, CoinIcon, PlayIcon } from "@/components/icons";

function timeShort(iso: string): string {
  return new Date(iso).toLocaleTimeString("uk-UA", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

const ACTIVE_STATES = new Set(["planning", "running"]);

export default function RunDetailPage() {
  const params = useParams<{ slug: string }>();
  const id = params.slug;

  const [data, setData] = useState<RunDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [approving, setApproving] = useState(false);
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
    const t = setInterval(refresh, 3500);
    return () => clearInterval(t);
  }, [refresh]);

  async function handleApprove() {
    setApproving(true);
    try {
      const detail = await api.approvePlan(id);
      setData(detail);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не вдалося запустити прогін");
    } finally {
      setApproving(false);
    }
  }

  if (error && !data) {
    return (
      <div className="px-6 py-10 md:px-10">
        <Link href="/runs" className="text-[13px] text-[var(--color-honey)]">
          ← До прогонів
        </Link>
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

  return (
    <div className="px-6 py-7 md:px-10">
      {/* Хлібні крихти + шапка */}
      <div className="flex items-center gap-2 text-[12px] text-[var(--color-fg-subtle)]">
        <Link
          href="/runs"
          className="inline-flex items-center gap-1 hover:text-[var(--color-fg)]"
        >
          <ArrowLeftIcon width={14} height={14} /> Прогони рою
        </Link>
        <span>/</span>
        <span className="font-mono">#{run.id}</span>
      </div>

      <div className="mt-3 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <h1 className="font-display text-[22px] font-semibold leading-snug tracking-tight md:text-[26px]">
            {run.goal}
          </h1>
          <div className="mt-2 flex items-center gap-3">
            <RunStatusBadge status={run.status} />
            {isActive && (
              <span className="inline-flex items-center gap-1.5 text-[12px] text-[var(--color-fg-subtle)]">
                <span className="h-1.5 w-1.5 animate-ping rounded-full bg-[var(--color-honey)]" />
                рій працює…
              </span>
            )}
          </div>
        </div>
        {/* Телеметрія витрат */}
        <div className="flex items-center gap-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-2.5">
          <div className="text-right">
            <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-[var(--color-fg-subtle)]">
              <CoinIcon width={13} height={13} /> вартість
            </div>
            <div className="font-mono text-[15px] tabular text-[var(--color-honey)]">
              ${run.costUsd.toFixed(3)}
            </div>
          </div>
          <div className="h-8 w-px bg-[var(--color-border)]" />
          <div className="text-right">
            <div className="text-[11px] uppercase tracking-wide text-[var(--color-fg-subtle)]">
              токени
            </div>
            <div className="font-mono text-[15px] tabular text-[var(--color-fg-muted)]">
              {(run.inputTokens + run.outputTokens).toLocaleString("uk-UA")}
            </div>
          </div>
        </div>
      </div>

      {/* Помилка прогону */}
      {run.status === "failed" && run.error && (
        <div className="mt-5 rounded-xl border border-[var(--color-danger)]/30 bg-[var(--color-danger)]/10 px-4 py-3 text-[13px] text-[var(--color-danger)]">
          {run.error}
        </div>
      )}

      {/* Схвалення плану */}
      {run.status === "awaiting_approval" && (
        <div className="mt-5 rounded-[var(--radius-card)] border border-[var(--color-honey)]/30 bg-gradient-to-br from-[var(--color-honey)]/[0.08] to-transparent p-5">
          <h2 className="font-display text-[16px] font-semibold">
            Стратег склав план — потрібне твоє схвалення
          </h2>
          <p className="mt-1 text-[13px] text-[var(--color-fg-muted)]">
            Переглянь {tasks.length} завдань нижче. Натисни «Запустити рій», щоб виконавці взялися до роботи.
          </p>
          <button
            onClick={handleApprove}
            disabled={approving}
            className="mt-4 inline-flex items-center gap-2 rounded-xl bg-[var(--color-honey)] px-5 py-2.5 text-[14px] font-semibold text-[var(--color-ink)] transition-colors hover:bg-[var(--color-honey-bright)] disabled:opacity-60"
          >
            <PlayIcon width={16} height={16} />
            {approving ? "Запускаю…" : "Запустити рій"}
          </button>
        </div>
      )}

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Дошка завдань */}
        <section className="lg:col-span-2 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-[15px] font-semibold">
              Завдання · {tasks.length}
            </h2>
            <div className="w-40">
              <ProgressBar done={done} total={tasks.length} />
            </div>
          </div>

          {tasks.length === 0 && (
            <p className="rounded-[var(--radius-card)] border border-dashed border-[var(--color-border)] px-5 py-8 text-center text-[13px] text-[var(--color-fg-muted)]">
              {run.status === "planning"
                ? "Стратег розкладає ціль на завдання…"
                : "Завдань немає."}
            </p>
          )}

          {tasks.map((t) => (
            <TaskCard key={t.id} task={t} />
          ))}

          {/* Підсумкове зведення */}
          {run.summary && (
            <div className="rounded-[var(--radius-card)] border border-[var(--color-honey)]/25 bg-[var(--color-surface)] p-5">
              <h3 className="mb-3 flex items-center gap-2 font-display text-[15px] font-semibold text-[var(--color-honey)]">
                Зведення від Стратега
              </h3>
              <Markdown>{run.summary}</Markdown>
            </div>
          )}
        </section>

        {/* Журнал роботи рою */}
        <section className="lg:col-span-1">
          <h2 className="mb-3 font-display text-[15px] font-semibold">Журнал рою</h2>
          <div className="rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-surface)]">
            {activity.length === 0 ? (
              <p className="px-4 py-6 text-center text-[13px] text-[var(--color-fg-muted)]">
                Поки порожньо.
              </p>
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

function TaskCard({ task }: { task: RunTask }) {
  const [open, setOpen] = useState(false);
  const name = task.agentName ?? task.agentSlug;
  return (
    <div className="rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
      <div className="flex items-start gap-3">
        <AgentBadge name={name} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-3">
            <span className="font-display text-[14px] font-semibold">{name}</span>
            <div className="flex items-center gap-2.5">
              {task.revisionRound > 0 && (
                <span className="rounded-md bg-[var(--color-surface-2)] px-1.5 py-0.5 font-mono text-[10px] text-[var(--color-fg-subtle)]">
                  коло {task.revisionRound}
                </span>
              )}
              <TaskStatusBadge status={task.status} />
            </div>
          </div>
          <p className="mt-1 text-[13px] leading-relaxed text-[var(--color-fg-muted)]">
            {task.description}
          </p>

          {/* Вердикт Критика */}
          {task.criticVerdict && (
            <div
              className={[
                "mt-2.5 rounded-lg border px-3 py-2 text-[12.5px]",
                task.criticVerdict === "approved"
                  ? "border-[var(--color-online)]/25 bg-[var(--color-online)]/[0.07] text-[var(--color-fg-muted)]"
                  : "border-[var(--color-busy)]/25 bg-[var(--color-busy)]/[0.07] text-[var(--color-fg-muted)]",
              ].join(" ")}
            >
              <span
                className="font-medium"
                style={{
                  color:
                    task.criticVerdict === "approved"
                      ? "var(--color-online)"
                      : "var(--color-busy)",
                }}
              >
                Критик:{" "}
                {task.criticVerdict === "approved"
                  ? "схвалено"
                  : "на доопрацювання"}
              </span>
              {task.criticComment && <> — {task.criticComment}</>}
            </div>
          )}

          {task.ownerFeedback && (
            <div className="mt-2 rounded-lg border border-[var(--color-info)]/25 bg-[var(--color-info)]/[0.07] px-3 py-2 text-[12.5px] text-[var(--color-fg-muted)]">
              <span className="font-medium text-[var(--color-info)]">Твій коментар:</span>{" "}
              {task.ownerFeedback}
            </div>
          )}

          {/* Результат */}
          {task.result && (
            <div className="mt-3">
              <button
                onClick={() => setOpen((v) => !v)}
                className="text-[12px] font-medium text-[var(--color-honey)] hover:text-[var(--color-honey-bright)]"
              >
                {open ? "Згорнути результат ↑" : "Показати результат ↓"}
              </button>
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
          <span className="shrink-0 font-mono text-[10px] text-[var(--color-fg-subtle)]">
            {timeShort(entry.createdAt)}
          </span>
        </div>
        {entry.detail && (
          <p className="mt-0.5 line-clamp-2 text-[12px] text-[var(--color-fg-subtle)]">
            {entry.detail}
          </p>
        )}
      </div>
    </li>
  );
}
