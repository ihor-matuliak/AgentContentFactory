"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { AgentSummary } from "@swarm/shared";
import { api } from "@/lib/api";
import { AgentBadge, PageHeader, StatusBadge } from "@/components/ui";

/** Майбутній склад рою (зʼявиться в наступних фазах). */
const PLANNED = [
  { name: "Сценарист", role: "Пише сценарії відео та пости" },
  { name: "Дизайнер", role: "Візуали: обкладинки, кадри, графіка" },
  { name: "Монтажер", role: "Збирає та монтує відео" },
  { name: "Публікатор", role: "Планує й публікує контент" },
  { name: "Критик", role: "Перевіряє якість на гілці перед випуском" },
  { name: "Рісерчер", role: "Шукає теми, тренди й референси" },
];

export default function ChatListPage() {
  const [agents, setAgents] = useState<AgentSummary[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let alive = true;
    api
      .listAgents()
      .then((list) => alive && setAgents(list))
      .catch(
        (e: unknown) =>
          alive &&
          setError(e instanceof Error ? e.message : "Не вдалося завантажити"),
      )
      .finally(() => alive && setLoaded(true));
    return () => {
      alive = false;
    };
  }, []);

  return (
    <>
      <PageHeader
        title="Чати з агентами"
        subtitle="Виберіть агента, щоб відкрити переписку. З кожним можна поговорити один на один — історія зберігається в базі."
      />

      <div className="space-y-8 px-6 py-7 md:px-10">
        {error && (
          <div className="rounded-xl border border-[var(--color-danger)]/30 bg-[var(--color-danger)]/10 px-4 py-3 text-[13px] text-[var(--color-danger)]">
            {error}. Перевірте, що бекенд запущено на {api.backendUrl}.
          </div>
        )}

        {/* Активні агенти */}
        <section>
          <h2 className="mb-3 text-[12px] font-medium uppercase tracking-[0.16em] text-[var(--color-fg-subtle)]">
            У строю
          </h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {!loaded &&
              [0, 1].map((i) => (
                <div
                  key={i}
                  className="h-[116px] animate-pulse rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-surface)]"
                />
              ))}

            {loaded &&
              agents.map((a) => (
                <Link
                  key={a.id}
                  href={`/chat/${a.slug}`}
                  className="group flex flex-col gap-3 rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-surface)] p-5 transition-all hover:border-[var(--color-honey)]/40 hover:bg-[var(--color-surface-2)]"
                >
                  <div className="flex items-center gap-3">
                    <AgentBadge name={a.name} />
                    <div className="min-w-0">
                      <div className="font-display text-[16px] font-semibold">
                        {a.name}
                      </div>
                      <StatusBadge status={a.status} />
                    </div>
                  </div>
                  <p className="text-[13px] leading-relaxed text-[var(--color-fg-muted)]">
                    {a.role}
                  </p>
                  <span className="mt-auto text-[12px] text-[var(--color-honey)] opacity-0 transition-opacity group-hover:opacity-100">
                    Відкрити переписку →
                  </span>
                </Link>
              ))}
          </div>
        </section>

        {/* Майбутній склад */}
        <section>
          <h2 className="mb-3 text-[12px] font-medium uppercase tracking-[0.16em] text-[var(--color-fg-subtle)]">
            Долучаться згодом
          </h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {PLANNED.map((a) => (
              <div
                key={a.name}
                className="flex flex-col gap-3 rounded-[var(--radius-card)] border border-dashed border-[var(--color-border)] bg-transparent p-5 opacity-65"
                title="Зʼявиться в наступних фазах"
              >
                <div className="flex items-center gap-3">
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[var(--color-surface-2)] font-display text-[14px] font-semibold text-[var(--color-fg-subtle)]">
                    {a.name.slice(0, 2)}
                  </span>
                  <div className="min-w-0">
                    <div className="font-display text-[16px] font-semibold text-[var(--color-fg-muted)]">
                      {a.name}
                    </div>
                    <span className="rounded-md bg-[var(--color-surface-2)] px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-[var(--color-fg-subtle)]">
                      скоро
                    </span>
                  </div>
                </div>
                <p className="text-[13px] leading-relaxed text-[var(--color-fg-subtle)]">
                  {a.role}
                </p>
              </div>
            ))}
          </div>
        </section>
      </div>
    </>
  );
}
