"use client";

import { useEffect, useState } from "react";
import type { HealthResponse } from "@swarm/shared";
import { api } from "@/lib/api";
import { PageHeader } from "@/components/ui";
import { AccountIcon, LockIcon } from "@/components/icons";

export default function AccountPage() {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [down, setDown] = useState(false);
  const [hasPw, setHasPw] = useState(false);

  useEffect(() => {
    api
      .health()
      .then(setHealth)
      .catch(() => setDown(true));
    setHasPw(api.hasPassword());
  }, []);

  function logout() {
    api.setPassword("");
    window.location.reload();
  }

  return (
    <>
      <PageHeader
        title="Акаунт"
        subtitle="Стан платформи та доступ. Командний центр рою ШІ-агентів фабрики контенту."
      />

      <div className="mx-auto max-w-3xl space-y-4 px-6 py-7 md:px-10">
        <div className="rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
          <div className="flex items-center gap-2 text-[14px] font-semibold">
            <AccountIcon width={18} height={18} className="text-[var(--color-honey)]" />
            Стан бекенду
          </div>
          <div className="mt-3 flex items-center gap-2.5 text-[13px]">
            <span
              className={`h-2 w-2 rounded-full ${down ? "bg-[var(--color-danger)]" : "bg-[var(--color-online)]"}`}
              style={down ? undefined : { boxShadow: "0 0 8px var(--color-online)" }}
            />
            <span className="text-[var(--color-fg-muted)]">
              {down ? "Бекенд недоступний" : "Бекенд онлайн"}
            </span>
            {health && (
              <span className="rounded-md bg-[var(--color-surface-2)] px-2 py-0.5 font-mono text-[11px] text-[var(--color-fg-subtle)]">
                {health.service}
              </span>
            )}
          </div>
          <p className="mt-2 font-mono text-[11px] text-[var(--color-fg-subtle)]">
            {api.backendUrl}
          </p>
        </div>

        <div className="rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
          <div className="flex items-center gap-2 text-[14px] font-semibold">
            <LockIcon width={18} height={18} className="text-[var(--color-honey)]" />
            Доступ
          </div>
          <p className="mt-2 text-[13px] text-[var(--color-fg-muted)]">
            {hasPw
              ? "Дашборд захищено паролем — він збережений у цьому браузері."
              : "Авторизацію вимкнено (SWARM_PASSWORD порожній)."}
          </p>
          {hasPw && (
            <button
              onClick={logout}
              className="mt-4 rounded-xl border border-[var(--color-border-strong)] px-4 py-2 text-[13px] font-medium text-[var(--color-fg-muted)] transition-colors hover:border-[var(--color-danger)]/40 hover:text-[var(--color-danger)]"
            >
              Вийти
            </button>
          )}
        </div>
      </div>
    </>
  );
}
