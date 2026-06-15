"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type DragEvent } from "react";
import type { BoardTask, TaskStatus } from "@swarm/shared";
import { api } from "@/lib/api";
import { PageHeader, AgentBadge } from "@/components/ui";

/** Колонки дошки в порядку руху завдання зліва направо. */
const COLUMNS: { status: TaskStatus; label: string; accent: string }[] = [
  { status: "pending", label: "У черзі", accent: "var(--color-fg-subtle)" },
  { status: "in_progress", label: "В роботі", accent: "var(--color-busy)" },
  { status: "waiting_question", label: "Чекає відповіді", accent: "var(--color-honey)" },
  { status: "done", label: "На перевірці", accent: "var(--color-info)" },
  { status: "approved", label: "Зроблено", accent: "var(--color-online)" },
  { status: "failed", label: "Скасовано", accent: "var(--color-danger)" },
];

export default function TasksBoardPage() {
  const [tasks, setTasks] = useState<BoardTask[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragId, setDragId] = useState<number | null>(null);
  const [overCol, setOverCol] = useState<TaskStatus | null>(null);
  const draggingRef = useRef(false);

  const refresh = useCallback(async () => {
    if (draggingRef.current) return; // не смикаємо дошку під час перетягування
    try {
      setTasks(await api.listBoard());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не вдалося завантажити дошку");
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const t = setInterval(refresh, 6000);
    return () => clearInterval(t);
  }, [refresh]);

  async function move(task: BoardTask, status: TaskStatus) {
    if (task.status === status) return;
    const prev = tasks;
    // Оптимістично пересуваємо картку.
    setTasks((list) =>
      list.map((t) => (t.id === task.id ? { ...t, status } : t)),
    );
    try {
      await api.setTaskStatus(task.runId, task.id, status);
      void refresh();
    } catch (e) {
      setTasks(prev); // відкат
      setError(e instanceof Error ? e.message : "Не вдалося оновити статус");
    }
  }

  function onDrop(e: DragEvent, status: TaskStatus) {
    e.preventDefault();
    setOverCol(null);
    draggingRef.current = false;
    const id = Number(e.dataTransfer.getData("text/plain"));
    const task = tasks.find((t) => t.id === id);
    setDragId(null);
    if (task) void move(task, status);
  }

  return (
    <>
      <PageHeader
        title="Задачі"
        subtitle="Дошка задач рою. Перетягни картку між колонками, щоб змінити статус виконання."
      />

      <div className="px-6 py-6 md:px-10">
        {error && (
          <div className="mb-4 rounded-xl border border-[var(--color-danger)]/30 bg-[var(--color-danger)]/10 px-4 py-3 text-[13px] text-[var(--color-danger)]">
            {error}
          </div>
        )}

        {loaded && tasks.length === 0 && (
          <div className="rounded-[var(--radius-card)] border border-dashed border-[var(--color-border)] bg-[var(--color-surface)] px-6 py-14 text-center">
            <p className="text-[14px] text-[var(--color-fg-muted)]">
              Завдань ще немає.{" "}
              <Link href="/runs" className="text-[var(--color-honey)] hover:text-[var(--color-honey-bright)]">
                Постав рою ціль →
              </Link>
            </p>
          </div>
        )}

        <div className="flex gap-4 overflow-x-auto pb-4">
          {COLUMNS.map((col) => {
            const items = tasks.filter((t) => t.status === col.status);
            const isOver = overCol === col.status;
            return (
              <div
                key={col.status}
                onDragOver={(e) => {
                  e.preventDefault();
                  setOverCol(col.status);
                }}
                onDragLeave={() => setOverCol((c) => (c === col.status ? null : c))}
                onDrop={(e) => onDrop(e, col.status)}
                className={[
                  "flex w-[280px] shrink-0 flex-col rounded-[var(--radius-card)] border bg-[var(--color-base)]/40 transition-colors",
                  isOver
                    ? "border-[var(--color-honey)]/60 bg-[var(--color-honey)]/[0.05]"
                    : "border-[var(--color-border)]",
                ].join(" ")}
              >
                <div className="flex items-center justify-between gap-2 border-b border-[var(--color-border)] px-4 py-3">
                  <div className="flex items-center gap-2">
                    <span
                      className="h-2 w-2 rounded-full"
                      style={{ backgroundColor: col.accent, boxShadow: `0 0 7px ${col.accent}` }}
                    />
                    <span className="text-[13px] font-semibold">{col.label}</span>
                  </div>
                  <span className="font-mono text-[11px] tabular text-[var(--color-fg-subtle)]">
                    {items.length}
                  </span>
                </div>

                <div className="flex min-h-[120px] flex-1 flex-col gap-2.5 p-3">
                  {!loaded &&
                    [0, 1].map((i) => (
                      <div
                        key={i}
                        className="h-20 animate-pulse rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)]"
                      />
                    ))}

                  {items.map((task) => (
                    <BoardCard
                      key={task.id}
                      task={task}
                      dragging={dragId === task.id}
                      onDragStart={(e) => {
                        e.dataTransfer.setData("text/plain", String(task.id));
                        e.dataTransfer.effectAllowed = "move";
                        draggingRef.current = true;
                        setDragId(task.id);
                      }}
                      onDragEnd={() => {
                        draggingRef.current = false;
                        setDragId(null);
                        setOverCol(null);
                      }}
                    />
                  ))}

                  {loaded && items.length === 0 && (
                    <p className="px-1 py-3 text-center text-[12px] text-[var(--color-fg-faint)]">
                      —
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}

function BoardCard({
  task,
  dragging,
  onDragStart,
  onDragEnd,
}: {
  task: BoardTask;
  dragging: boolean;
  onDragStart: (e: DragEvent) => void;
  onDragEnd: () => void;
}) {
  const name = task.agentName ?? task.agentSlug;
  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      className={[
        "cursor-grab rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-3 active:cursor-grabbing",
        dragging ? "opacity-40" : "hover:border-[var(--color-honey)]/40",
      ].join(" ")}
    >
      <div className="flex items-center gap-2">
        <span className="grid h-6 w-6 shrink-0 place-items-center rounded-md bg-[var(--color-honey)]/12 font-display text-[10px] font-semibold text-[var(--color-honey)]">
          {name.slice(0, 2).toUpperCase()}
        </span>
        <span className="truncate text-[12px] font-medium text-[var(--color-fg-muted)]">
          {name}
        </span>
        {task.revisionRound > 0 && (
          <span className="ml-auto rounded bg-[var(--color-surface-2)] px-1.5 py-0.5 font-mono text-[9px] text-[var(--color-fg-subtle)]">
            коло {task.revisionRound}
          </span>
        )}
      </div>

      <p className="mt-2 line-clamp-3 text-[13px] leading-snug text-[var(--color-fg)]">
        {task.description}
      </p>

      {task.question && task.status === "waiting_question" && (
        <p className="mt-2 line-clamp-2 rounded-md bg-[var(--color-honey)]/10 px-2 py-1 text-[11.5px] text-[var(--color-honey)]">
          ❓ {task.question}
        </p>
      )}

      <div className="mt-2.5 flex items-center justify-between gap-2 border-t border-[var(--color-border)] pt-2">
        <Link
          href={`/runs/${task.runId}`}
          className="truncate font-mono text-[10px] text-[var(--color-fg-subtle)] hover:text-[var(--color-honey)]"
          title={task.runGoal}
        >
          #{task.runId} · {task.runGoal}
        </Link>
        {task.costUsd > 0 && (
          <span className="shrink-0 font-mono text-[10px] tabular text-[var(--color-fg-faint)]">
            ${task.costUsd.toFixed(3)}
          </span>
        )}
      </div>
    </div>
  );
}
