"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import type { RunSummary } from "@swarm/shared";
import { api } from "@/lib/api";
import { PageHeader, ProgressBar, RunStatusBadge } from "@/components/ui";
import { PlayIcon, SparkIcon } from "@/components/icons";

function timeAgo(iso: string): string {
  const min = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (min < 1) return "щойно";
  if (min < 60) return `${min} хв тому`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h} год тому`;
  return `${Math.floor(h / 24)} дн тому`;
}

export default function RunsPage() {
  const router = useRouter();
  const [runs, setRuns] = useState<RunSummary[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [goal, setGoal] = useState("");
  const [bigRun, setBigRun] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    try {
      const list = await api.listRuns();
      setRuns(list);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не вдалося завантажити прогони");
    } finally {
      setLoaded(true);
    }
  }

  useEffect(() => {
    void refresh();
    const t = setInterval(refresh, 5000);
    return () => clearInterval(t);
  }, []);

  async function handleLaunch(e: FormEvent) {
    e.preventDefault();
    const text = goal.trim();
    if (!text || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const run = await api.createRun(text, bigRun ? "large" : undefined);
      router.push(`/runs/${run.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не вдалося запустити прогін");
      setSubmitting(false);
    }
  }

  return (
    <>
      <PageHeader
        title="Прогони рою"
        subtitle="Постав рою ціль — Стратег складе план і роздасть завдання, виконавці зроблять, Критик перевірить, а ти ухвалиш результат."
      />

      <div className="space-y-8 px-6 py-7 md:px-10">
        {/* Композер нової цілі */}
        <form
          onSubmit={handleLaunch}
          className="rounded-[var(--radius-card)] border border-[var(--color-honey)]/25 bg-gradient-to-br from-[var(--color-honey)]/[0.07] to-transparent p-5"
        >
          <label className="mb-2 flex items-center gap-2 text-[13px] font-medium text-[var(--color-fg-muted)]">
            <SparkIcon width={16} height={16} className="text-[var(--color-honey)]" />
            Нова ціль для рою
          </label>
          <textarea
            value={goal}
            onChange={(e) => setGoal(e.target.value)}
            rows={3}
            placeholder="Напр.: зроби серію з 3 YouTube Shorts про застосунок для бігу — від ідеї до плану публікації"
            className="w-full resize-none rounded-xl border border-[var(--color-border)] bg-[var(--color-base)] px-4 py-3 text-[14px] text-[var(--color-fg)] placeholder:text-[var(--color-fg-subtle)] focus:border-[var(--color-honey)]/50 focus:outline-none"
          />
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
            <label className="flex cursor-pointer items-center gap-2 text-[13px] text-[var(--color-fg-muted)]">
              <input
                type="checkbox"
                checked={bigRun}
                onChange={(e) => setBigRun(e.target.checked)}
                className="h-4 w-4 accent-[var(--color-honey)]"
              />
              Великий прогін — спершу показати план на схвалення
            </label>
            <button
              type="submit"
              disabled={!goal.trim() || submitting}
              className="inline-flex items-center gap-2 rounded-xl bg-[var(--color-honey)] px-5 py-2.5 text-[14px] font-semibold text-[var(--color-ink)] transition-colors hover:bg-[var(--color-honey-bright)] disabled:cursor-not-allowed disabled:bg-[var(--color-surface-2)] disabled:text-[var(--color-fg-subtle)]"
            >
              <PlayIcon width={16} height={16} />
              {submitting ? "Запускаю…" : "Запустити прогін"}
            </button>
          </div>
          <p className="mt-2 text-[12px] text-[var(--color-fg-subtle)]">
            Дрібний прогін стартує одразу. Великий — стане на паузу з планом, доки ти його не запустиш.
          </p>
          {error && (
            <p className="mt-2 text-[13px] text-[var(--color-danger)]">{error}</p>
          )}
        </form>

        {/* Список прогонів */}
        <section>
          <h2 className="mb-3 text-[12px] font-medium uppercase tracking-[0.16em] text-[var(--color-fg-subtle)]">
            Усі прогони {loaded && `· ${runs.length}`}
          </h2>

          {loaded && runs.length === 0 && (
            <div className="rounded-[var(--radius-card)] border border-dashed border-[var(--color-border)] bg-[var(--color-surface)] px-6 py-12 text-center">
              <p className="text-[14px] text-[var(--color-fg-muted)]">
                Прогонів ще немає. Постав рою першу ціль вище ↑
              </p>
            </div>
          )}

          <div className="space-y-3">
            {!loaded &&
              [0, 1, 2].map((i) => (
                <div
                  key={i}
                  className="h-[92px] animate-pulse rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-surface)]"
                />
              ))}

            {loaded &&
              runs.map((r) => (
                <Link
                  key={r.id}
                  href={`/runs/${r.id}`}
                  className="group block rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-surface)] p-5 transition-all hover:border-[var(--color-honey)]/40 hover:bg-[var(--color-surface-2)]"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2.5">
                        <span className="font-mono text-[12px] text-[var(--color-fg-subtle)]">
                          #{r.id}
                        </span>
                        <RunStatusBadge status={r.status} />
                      </div>
                      <p className="mt-2 line-clamp-2 text-[15px] font-medium text-[var(--color-fg)] group-hover:text-[var(--color-honey-bright)]">
                        {r.goal}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <div className="font-mono text-[11px] text-[var(--color-fg-subtle)]">
                        {timeAgo(r.createdAt)}
                      </div>
                      {r.costUsd > 0 && (
                        <div className="mt-1 font-mono text-[11px] tabular text-[var(--color-fg-faint)]">
                          ${r.costUsd.toFixed(3)}
                        </div>
                      )}
                    </div>
                  </div>
                  {r.totalTasks > 0 && (
                    <div className="mt-3">
                      <ProgressBar done={r.doneTasks} total={r.totalTasks} />
                    </div>
                  )}
                </Link>
              ))}
          </div>
        </section>
      </div>
    </>
  );
}
