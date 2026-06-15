"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { AgentSummary, RunSummary, SwarmEvent } from "@swarm/shared";
import { api } from "@/lib/api";
import { useProject } from "@/components/ProjectContext";
import { ChatIcon, PulseIcon } from "@/components/icons";
import { AgentBadge, PageHeader, ProgressBar, RunStatusBadge, StatusBadge } from "@/components/ui";

function timeAgo(iso: string): string {
  const min = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (min < 1) return "щойно";
  if (min < 60) return `${min} хв тому`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h} год тому`;
  return `${Math.floor(h / 24)} дн тому`;
}

function StatCard({ label, value, hint, accent }: { label: string; value: string; hint: string; accent?: boolean }) {
  return (
    <div className="rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
      <div className="text-[12px] uppercase tracking-[0.14em] text-[var(--color-fg-subtle)]">{label}</div>
      <div className={["mt-3 font-mono text-[32px] font-semibold leading-none tabular", accent ? "text-[var(--color-honey)]" : "text-[var(--color-fg)]"].join(" ")}>
        {value}
      </div>
      <div className="mt-2 text-[13px] text-[var(--color-fg-muted)]">{hint}</div>
    </div>
  );
}

export default function ProjectOverviewPage() {
  const project = useProject();
  const base = `/projects/${project.slug}`;
  const [agents, setAgents] = useState<AgentSummary[]>([]);
  const [runs, setRuns] = useState<RunSummary[]>([]);
  const [events, setEvents] = useState<SwarmEvent[]>([]);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [a, r, e] = await Promise.all([
          api.listAgents(),
          api.listRuns(project.id),
          api.listEvents(project.id),
        ]);
        if (!alive) return;
        setAgents(a);
        setRuns(r);
        setEvents(e.items.slice(0, 6));
      } catch {
        /* ігноруємо — нижче порожні стани */
      }
    })();
    return () => {
      alive = false;
    };
  }, [project.id]);

  const activeRuns = runs.filter((r) => r.status === "running" || r.status === "planning").length;
  const reviewRuns = runs.filter((r) => r.status === "awaiting_review").length;
  const totalCost = runs.reduce((s, r) => s + r.costUsd, 0);

  return (
    <>
      <PageHeader
        title={`Огляд · ${project.name}`}
        subtitle={project.description || "Загальна картина проєкту: прогони рою, активність і команда."}
      />

      <div className="space-y-6 px-6 py-7 md:px-10">
        <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard label="Прогонів" value={String(runs.length)} hint="Усього у проєкті" accent />
          <StatCard label="Активних" value={String(activeRuns)} hint="Планування / виконання" />
          <StatCard label="На перевірці" value={String(reviewRuns)} hint="Чекають твого слова" />
          <StatCard label="Витрати" value={`$${totalCost.toFixed(2)}`} hint="Сумарно за прогони" />
        </section>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
          <section className="lg:col-span-3 rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-surface)]">
            <div className="flex items-center justify-between border-b border-[var(--color-border)] px-5 py-4">
              <div className="flex items-center gap-2">
                <PulseIcon className="text-[var(--color-honey)]" />
                <h2 className="text-[15px] font-semibold">Останні прогони</h2>
              </div>
              <Link href={`${base}/runs`} className="text-[12px] text-[var(--color-honey)] hover:text-[var(--color-honey-bright)]">
                Усі →
              </Link>
            </div>
            {runs.length === 0 ? (
              <div className="px-5 py-12 text-center">
                <p className="text-[14px] text-[var(--color-fg-muted)]">Прогонів ще немає.</p>
                <Link href={`${base}/runs`} className="mt-3 inline-block text-[13px] text-[var(--color-honey)]">
                  Поставити ціль →
                </Link>
              </div>
            ) : (
              <ul className="divide-y divide-[var(--color-border)]">
                {runs.slice(0, 6).map((r) => (
                  <li key={r.id}>
                    <Link href={`${base}/runs/${r.id}`} className="block px-5 py-3.5 transition-colors hover:bg-[var(--color-surface-2)]">
                      <div className="flex items-center justify-between gap-3">
                        <span className="truncate text-[14px] font-medium">{r.goal}</span>
                        <RunStatusBadge status={r.status} />
                      </div>
                      {r.totalTasks > 0 && (
                        <div className="mt-2">
                          <ProgressBar done={r.doneTasks} total={r.totalTasks} />
                        </div>
                      )}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="lg:col-span-2 rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-surface)]">
            <div className="flex items-center justify-between border-b border-[var(--color-border)] px-5 py-4">
              <h2 className="text-[15px] font-semibold">Команда рою</h2>
              <Link href={`${base}/chats`} className="text-[12px] text-[var(--color-honey)] hover:text-[var(--color-honey-bright)]">
                Чати →
              </Link>
            </div>
            <ul className="p-2">
              {agents.map((a) => (
                <li key={a.id}>
                  <Link href={`${base}/chats/${a.slug}`} className="flex items-center gap-3 rounded-xl px-3 py-2.5 transition-colors hover:bg-[var(--color-surface-2)]">
                    <AgentBadge name={a.name} />
                    <div className="min-w-0 flex-1">
                      <div className="text-[14px] font-medium">{a.name}</div>
                      <div className="truncate text-[12px] text-[var(--color-fg-muted)]">{a.role}</div>
                    </div>
                    <StatusBadge status={a.status} />
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        </div>

        {events.length > 0 && (
          <section className="rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-surface)]">
            <div className="flex items-center gap-2 border-b border-[var(--color-border)] px-5 py-4">
              <ChatIcon className="text-[var(--color-honey)]" />
              <h2 className="text-[15px] font-semibold">Останні події</h2>
            </div>
            <ul className="divide-y divide-[var(--color-border)]">
              {events.map((e) => (
                <li key={e.id} className="flex gap-3 px-5 py-3">
                  <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-[var(--color-honey)]/70" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="text-[13px] font-medium">{e.title}</span>
                      <span className="shrink-0 font-mono text-[11px] text-[var(--color-fg-subtle)]">{timeAgo(e.createdAt)}</span>
                    </div>
                    {e.body && <p className="mt-0.5 truncate text-[12.5px] text-[var(--color-fg-muted)]">{e.body}</p>}
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </>
  );
}
