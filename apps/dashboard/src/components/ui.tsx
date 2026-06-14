import type { AgentStatus } from "@swarm/shared";
import type { ReactNode } from "react";

/** Заголовок сторінки з підзаголовком і слотом праворуч. */
export function PageHeader({
  title,
  subtitle,
  right,
}: {
  title: string;
  subtitle?: string;
  right?: ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-4 border-b border-[var(--color-border)] px-6 py-6 md:px-10 md:py-7">
      <div>
        <h1 className="font-display text-2xl font-semibold tracking-tight md:text-[28px]">
          {title}
        </h1>
        {subtitle && (
          <p className="mt-1.5 max-w-2xl text-[14px] text-[var(--color-fg-muted)]">
            {subtitle}
          </p>
        )}
      </div>
      {right}
    </header>
  );
}

const STATUS_META: Record<
  AgentStatus,
  { label: string; color: string }
> = {
  idle: { label: "Готовий", color: "var(--color-online)" },
  busy: { label: "Працює", color: "var(--color-busy)" },
  offline: { label: "Не в мережі", color: "var(--color-offline)" },
};

/** Кольорова крапка + підпис статусу агента. */
export function StatusBadge({ status }: { status: AgentStatus }) {
  const meta = STATUS_META[status];
  return (
    <span className="inline-flex items-center gap-1.5 text-[12px] text-[var(--color-fg-muted)]">
      <span
        className="h-2 w-2 rounded-full"
        style={{ backgroundColor: meta.color, boxShadow: `0 0 8px ${meta.color}` }}
      />
      {meta.label}
    </span>
  );
}

/** Ініціали агента у вигляді «жетона». */
export function AgentBadge({ name }: { name: string }) {
  const initials = name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
  return (
    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[var(--color-honey)]/12 font-display text-[14px] font-semibold text-[var(--color-honey)] ring-1 ring-[var(--color-honey)]/20">
      {initials}
    </span>
  );
}
