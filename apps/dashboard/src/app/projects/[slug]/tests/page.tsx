"use client";

import { useEffect, useState } from "react";
import type { TestsOverview } from "@swarm/shared";
import { api } from "@/lib/api";
import { PageHeader } from "@/components/ui";
import { TestIcon } from "@/components/icons";

function pct(n: number): string {
  return `${Math.round(n * 100)}%`;
}

function rateColor(rate: number): string {
  if (rate >= 0.8) return "var(--color-online)";
  if (rate >= 0.5) return "var(--color-busy)";
  return "var(--color-danger)";
}

export default function TestsPage() {
  const [data, setData] = useState<TestsOverview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [seeding, setSeeding] = useState(false);
  const [running, setRunning] = useState(false);

  async function refresh() {
    try {
      setData(await api.getTests());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не вдалося завантажити тести");
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  async function seed() {
    setSeeding(true);
    setError(null);
    setInfo(null);
    try {
      const r = await api.seedTests();
      setInfo(`Завантажено сценаріїв: ${r.seeded}.`);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не вдалося завантажити сценарії");
    } finally {
      setSeeding(false);
    }
  }

  async function runBatch() {
    setRunning(true);
    setError(null);
    setInfo(null);
    try {
      const r = await api.batchTests(30);
      setInfo(`Прогнано тестів: ${r.ran}.`);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не вдалося прогнати тести");
    } finally {
      setRunning(false);
    }
  }

  return (
    <>
      <PageHeader
        title="Фабрика тестів"
        subtitle="Типові сценарії по всіх агентах прогоняються через Критика. Тут — зведення якості: пас-рейт, вартість і тривалість по агентах."
        right={
          <div className="flex items-center gap-2">
            <button onClick={seed} disabled={seeding} className="rounded-xl border border-[var(--color-border-strong)] px-4 py-2 text-[13px] font-medium text-[var(--color-fg-muted)] transition-colors hover:text-[var(--color-fg)] disabled:opacity-60">
              {seeding ? "Завантажую…" : "Завантажити сценарії"}
            </button>
            <button onClick={runBatch} disabled={running} className="inline-flex items-center gap-2 rounded-xl bg-[var(--color-honey)] px-4 py-2 text-[13px] font-semibold text-[var(--color-ink)] transition-colors hover:bg-[var(--color-honey-bright)] disabled:opacity-60">
              <TestIcon width={15} height={15} />
              {running ? "Прогін…" : "Прогнати тести"}
            </button>
          </div>
        }
      />

      <div className="space-y-6 px-6 py-7 md:px-10">
        {error && (
          <div className="rounded-xl border border-[var(--color-danger)]/30 bg-[var(--color-danger)]/10 px-4 py-3 text-[13px] text-[var(--color-danger)]">{error}</div>
        )}
        {info && (
          <div className="rounded-xl border border-[var(--color-online)]/30 bg-[var(--color-online)]/10 px-4 py-3 text-[13px] text-[var(--color-online)]">{info}</div>
        )}
        {running && (
          <div className="rounded-xl border border-[var(--color-honey)]/30 bg-[var(--color-honey)]/10 px-4 py-3 text-[13px] text-[var(--color-honey)]">
            Прогін тестів іде у фоні (виклики Claude). Це може зайняти кілька хвилин — оновіть сторінку згодом.
          </div>
        )}

        {/* Зведені метрики */}
        <section className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
            <div className="text-[12px] uppercase tracking-[0.14em] text-[var(--color-fg-subtle)]">Сценаріїв</div>
            <div className="mt-3 font-mono text-[32px] font-semibold leading-none tabular text-[var(--color-fg)]">{data?.scenarios ?? "—"}</div>
          </div>
          <div className="rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
            <div className="text-[12px] uppercase tracking-[0.14em] text-[var(--color-fg-subtle)]">Пас-рейт</div>
            <div className="mt-3 font-mono text-[32px] font-semibold leading-none tabular" style={{ color: data ? rateColor(data.passRate) : "var(--color-fg)" }}>
              {data && data.totalRuns > 0 ? pct(data.passRate) : "—"}
            </div>
            <div className="mt-2 text-[12px] text-[var(--color-fg-muted)]">{data?.totalRuns ?? 0} прогонів тестів</div>
          </div>
          <div className="rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
            <div className="text-[12px] uppercase tracking-[0.14em] text-[var(--color-fg-subtle)]">Вартість</div>
            <div className="mt-3 font-mono text-[32px] font-semibold leading-none tabular text-[var(--color-honey)]">${(data?.costUsd ?? 0).toFixed(3)}</div>
          </div>
        </section>

        {/* По агентах */}
        <section>
          <h2 className="mb-3 text-[12px] font-medium uppercase tracking-[0.16em] text-[var(--color-fg-subtle)]">Якість по агентах</h2>
          {!data || data.byAgent.length === 0 ? (
            <div className="rounded-[var(--radius-card)] border border-dashed border-[var(--color-border)] bg-[var(--color-surface)] px-6 py-12 text-center text-[14px] text-[var(--color-fg-muted)]">
              Ще немає прогонів тестів. Завантаж сценарії та натисни «Прогнати тести».
            </div>
          ) : (
            <div className="overflow-hidden rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-surface)]">
              <table className="w-full text-[13px]">
                <thead>
                  <tr className="border-b border-[var(--color-border)] text-left text-[12px] uppercase tracking-wide text-[var(--color-fg-subtle)]">
                    <th className="px-4 py-3 font-medium">Агент</th>
                    <th className="px-4 py-3 font-medium">Пас-рейт</th>
                    <th className="px-4 py-3 font-medium">Тести</th>
                    <th className="px-4 py-3 text-right font-medium">Вартість</th>
                    <th className="px-4 py-3 text-right font-medium">Сер. час</th>
                  </tr>
                </thead>
                <tbody>
                  {data.byAgent.map((a) => (
                    <tr key={a.agentSlug} className="border-b border-[var(--color-border)] last:border-0">
                      <td className="px-4 py-3 font-medium text-[var(--color-fg)]">{a.agentName}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className="h-1.5 w-24 overflow-hidden rounded-full bg-[var(--color-surface-2)]">
                            <div className="h-full rounded-full" style={{ width: pct(a.passRate), backgroundColor: rateColor(a.passRate) }} />
                          </div>
                          <span className="font-mono tabular" style={{ color: rateColor(a.passRate) }}>{pct(a.passRate)}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 font-mono tabular text-[var(--color-fg-muted)]">{a.passed}/{a.total}</td>
                      <td className="px-4 py-3 text-right font-mono tabular text-[var(--color-fg-muted)]">${a.costUsd.toFixed(3)}</td>
                      <td className="px-4 py-3 text-right font-mono tabular text-[var(--color-fg-muted)]">{(a.avgDurationMs / 1000).toFixed(1)} с</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* Останні прогони */}
        {data && data.recent.length > 0 && (
          <section>
            <h2 className="mb-3 text-[12px] font-medium uppercase tracking-[0.16em] text-[var(--color-fg-subtle)]">Останні прогони тестів</h2>
            <div className="space-y-2">
              {data.recent.map((r) => (
                <div key={r.id} className="flex items-center gap-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-2.5">
                  <span
                    className="grid h-6 w-6 shrink-0 place-items-center rounded-md font-mono text-[12px] font-bold"
                    style={{
                      color: r.verdict === "pass" ? "var(--color-online)" : "var(--color-danger)",
                      backgroundColor: r.verdict === "pass" ? "rgba(61,220,151,0.12)" : "rgba(251,113,133,0.12)",
                    }}
                  >
                    {r.verdict === "pass" ? "✓" : "✗"}
                  </span>
                  <div className="min-w-0 flex-1">
                    <span className="text-[13px] font-medium text-[var(--color-fg)]">{r.scenarioTitle ?? `Сценарій #${r.scenarioId}`}</span>
                    <span className="ml-2 font-mono text-[11px] text-[var(--color-fg-subtle)]">{r.agentSlug}</span>
                    {r.comment && <p className="truncate text-[12px] text-[var(--color-fg-muted)]">{r.comment}</p>}
                  </div>
                  {r.score != null && <span className="shrink-0 font-mono text-[12px] tabular text-[var(--color-fg-subtle)]">{r.score}</span>}
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </>
  );
}
