"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { AgentSummary } from "@swarm/shared";
import { api } from "@/lib/api";
import { useProject } from "@/components/ProjectContext";
import { AgentBadge, PageHeader, StatusBadge } from "@/components/ui";

export default function ChatListPage() {
  const project = useProject();
  const base = `/projects/${project.slug}`;
  const [agents, setAgents] = useState<AgentSummary[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let alive = true;
    api
      .listAgents()
      .then((list) => alive && setAgents(list))
      .catch((e: unknown) => alive && setError(e instanceof Error ? e.message : "Не вдалося завантажити"))
      .finally(() => alive && setLoaded(true));
    return () => {
      alive = false;
    };
  }, []);

  return (
    <>
      <PageHeader
        title="Чати з агентами"
        subtitle="Поговори з агентом один на один у контексті цього проєкту. У чаті можна поставити пряме завдання, делегувати Стратегу або запустити прогін рою."
      />

      <div className="space-y-6 px-6 py-7 md:px-10">
        {error && (
          <div className="rounded-xl border border-[var(--color-danger)]/30 bg-[var(--color-danger)]/10 px-4 py-3 text-[13px] text-[var(--color-danger)]">
            {error}. Перевірте, що бекенд запущено на {api.backendUrl}.
          </div>
        )}

        <section>
          <h2 className="mb-3 text-[12px] font-medium uppercase tracking-[0.16em] text-[var(--color-fg-subtle)]">
            Рій у строю · {loaded ? agents.length : 8}
          </h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {!loaded &&
              [0, 1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="h-[124px] animate-pulse rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-surface)]" />
              ))}

            {loaded &&
              agents.map((a) => (
                <Link
                  key={a.id}
                  href={`${base}/chats/${a.slug}`}
                  className="group flex flex-col gap-3 rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-surface)] p-5 transition-all hover:border-[var(--color-honey)]/40 hover:bg-[var(--color-surface-2)]"
                >
                  <div className="flex items-center gap-3">
                    <AgentBadge name={a.name} />
                    <div className="min-w-0">
                      <div className="font-display text-[16px] font-semibold">{a.name}</div>
                      <StatusBadge status={a.status} />
                    </div>
                  </div>
                  <p className="text-[13px] leading-relaxed text-[var(--color-fg-muted)]">{a.role}</p>
                  <span className="mt-auto text-[12px] text-[var(--color-honey)] opacity-0 transition-opacity group-hover:opacity-100">
                    Відкрити переписку →
                  </span>
                </Link>
              ))}
          </div>
        </section>
      </div>
    </>
  );
}
