"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { AgentSummary, ChatMessage, HealthResponse } from "@swarm/shared";
import { api } from "@/lib/api";
import { ChatIcon, PulseIcon, SparkIcon } from "@/components/icons";
import { AgentBadge, PageHeader, StatusBadge } from "@/components/ui";

const STRATEGIST_SLUG = "strategist";

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return "щойно";
  if (min < 60) return `${min} хв тому`;
  const hours = Math.floor(min / 60);
  if (hours < 24) return `${hours} год тому`;
  return `${Math.floor(hours / 24)} дн тому`;
}

function StatCard({
  label,
  value,
  hint,
  accent,
}: {
  label: string;
  value: string;
  hint: string;
  accent?: boolean;
}) {
  return (
    <div className="rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
      <div className="text-[12px] uppercase tracking-[0.14em] text-[var(--color-fg-subtle)]">
        {label}
      </div>
      <div
        className={[
          "mt-3 font-mono text-[34px] font-semibold leading-none tabular",
          accent ? "text-[var(--color-honey)]" : "text-[var(--color-fg)]",
        ].join(" ")}
      >
        {value}
      </div>
      <div className="mt-2 text-[13px] text-[var(--color-fg-muted)]">{hint}</div>
    </div>
  );
}

export default function OverviewPage() {
  const [agents, setAgents] = useState<AgentSummary[]>([]);
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [activity, setActivity] = useState<ChatMessage[]>([]);
  const [totalMessages, setTotalMessages] = useState(0);
  const [backendDown, setBackendDown] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [agentList, healthRes] = await Promise.all([
          api.listAgents(),
          api.health().catch(() => null),
        ]);
        if (!alive) return;
        setAgents(agentList);
        setHealth(healthRes);
        setBackendDown(healthRes === null);

        const strategist = agentList.find((a) => a.slug === STRATEGIST_SLUG);
        if (strategist) {
          const history = await api.getHistory(strategist.slug);
          if (alive) {
            setTotalMessages(history.length);
            setActivity(history.slice(-6).reverse());
          }
        }
      } catch {
        if (alive) setBackendDown(true);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const activeCount = agents.filter((a) => a.isActive).length;

  return (
    <>
      <PageHeader
        title="Огляд"
        subtitle="Загальна картина стану рою ШІ-агентів фабрики контенту."
        right={
          <div className="flex items-center gap-2 rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] px-3.5 py-2 text-[13px]">
            <span
              className={[
                "h-2 w-2 rounded-full",
                backendDown
                  ? "bg-[var(--color-danger)]"
                  : "bg-[var(--color-online)]",
              ].join(" ")}
              style={
                backendDown
                  ? undefined
                  : { boxShadow: "0 0 8px var(--color-online)" }
              }
            />
            <span className="text-[var(--color-fg-muted)]">
              {backendDown ? "Бекенд недоступний" : "Бекенд онлайн"}
            </span>
            {health && (
              <span className="ml-1 rounded-md bg-[var(--color-surface-2)] px-2 py-0.5 font-mono text-[11px] text-[var(--color-fg-subtle)]">
                {health.service}
              </span>
            )}
          </div>
        }
      />

      <div className="space-y-6 px-6 py-7 md:px-10">
        {/* Метрики */}
        <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard
            label="Агентів у строю"
            value={`${activeCount}/${agents.length || 0}`}
            hint="Активних із загальної кількості"
            accent
          />
          <StatCard
            label="Повідомлень зі Стратегом"
            value={String(totalMessages)}
            hint="Збережено в базі даних"
          />
          <StatCard
            label="Активних діалогів"
            value={String(totalMessages > 0 ? 1 : 0)}
            hint="Чатів із живою перепискою"
          />
          <StatCard
            label="Стан бекенду"
            value={backendDown ? "—" : "OK"}
            hint={backendDown ? "Запустіть npm run dev" : "GET /api/health відповідає"}
          />
        </section>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
          {/* Активність */}
          <section className="lg:col-span-3 rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-surface)]">
            <div className="flex items-center gap-2 border-b border-[var(--color-border)] px-5 py-4">
              <PulseIcon className="text-[var(--color-honey)]" />
              <h2 className="text-[15px] font-semibold">Останні дії</h2>
            </div>

            {activity.length === 0 ? (
              <div className="px-5 py-12 text-center">
                <p className="text-[14px] text-[var(--color-fg-muted)]">
                  Поки тиша. Напишіть Стратегу — і тут зʼявиться стрічка подій.
                </p>
                <Link
                  href={`/chat/${STRATEGIST_SLUG}`}
                  className="mt-4 inline-flex items-center gap-2 rounded-lg bg-[var(--color-honey)] px-4 py-2 text-[13px] font-semibold text-[var(--color-ink)] transition-colors hover:bg-[var(--color-honey-bright)]"
                >
                  <SparkIcon width={16} height={16} />
                  Поговорити зі Стратегом
                </Link>
              </div>
            ) : (
              <ul className="divide-y divide-[var(--color-border)]">
                {activity.map((m) => (
                  <li key={m.id} className="flex gap-3 px-5 py-3.5">
                    <span
                      className={[
                        "mt-1.5 h-2 w-2 shrink-0 rounded-full",
                        m.role === "assistant"
                          ? "bg-[var(--color-honey)]"
                          : "bg-[var(--color-info)]",
                      ].join(" ")}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline justify-between gap-3">
                        <span className="text-[13px] font-medium">
                          {m.role === "assistant" ? "Стратег" : "Ви"}
                        </span>
                        <span className="shrink-0 font-mono text-[11px] text-[var(--color-fg-subtle)]">
                          {timeAgo(m.createdAt)}
                        </span>
                      </div>
                      <p className="mt-0.5 truncate text-[13px] text-[var(--color-fg-muted)]">
                        {m.content}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* Команда рою */}
          <section className="lg:col-span-2 rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-surface)]">
            <div className="flex items-center justify-between border-b border-[var(--color-border)] px-5 py-4">
              <h2 className="text-[15px] font-semibold">Команда рою</h2>
              <Link
                href="/chat"
                className="text-[12px] text-[var(--color-honey)] hover:text-[var(--color-honey-bright)]"
              >
                Усі чати →
              </Link>
            </div>

            {agents.length === 0 ? (
              <p className="px-5 py-10 text-center text-[14px] text-[var(--color-fg-muted)]">
                {backendDown
                  ? "Список зʼявиться після запуску бекенду."
                  : "Агентів ще не додано."}
              </p>
            ) : (
              <ul className="p-2">
                {agents.map((a) => (
                  <li key={a.id}>
                    <Link
                      href={`/chat/${a.slug}`}
                      className="flex items-center gap-3 rounded-xl px-3 py-3 transition-colors hover:bg-[var(--color-surface-2)]"
                    >
                      <AgentBadge name={a.name} />
                      <div className="min-w-0 flex-1">
                        <div className="text-[14px] font-medium">{a.name}</div>
                        <div className="truncate text-[12px] text-[var(--color-fg-muted)]">
                          {a.role}
                        </div>
                      </div>
                      <StatusBadge status={a.status} />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        {/* Швидкий перехід у чат */}
        <Link
          href={`/chat/${STRATEGIST_SLUG}`}
          className="group flex items-center justify-between rounded-[var(--radius-card)] border border-[var(--color-honey)]/25 bg-gradient-to-r from-[var(--color-honey)]/10 to-transparent px-6 py-5 transition-colors hover:border-[var(--color-honey)]/45"
        >
          <div className="flex items-center gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-[var(--color-honey)]/15 text-[var(--color-honey)]">
              <ChatIcon />
            </span>
            <div>
              <div className="text-[15px] font-semibold">
                Поставити задачу Стратегу
              </div>
              <div className="text-[13px] text-[var(--color-fg-muted)]">
                Оркестратор-планувальник рою — спланує контент і розкладе кроки.
              </div>
            </div>
          </div>
          <span className="text-[var(--color-honey)] transition-transform group-hover:translate-x-1">
            →
          </span>
        </Link>
      </div>
    </>
  );
}
