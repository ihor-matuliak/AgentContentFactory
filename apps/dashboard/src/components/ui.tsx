import type { AgentStatus, Platform, RunStatus, TaskStatus } from "@swarm/shared";
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

// ─────────────────────────── Статуси прогонів (Фаза 3) ───────────────────────

const RUN_STATUS_META: Record<RunStatus, { label: string; fg: string; bg: string }> = {
  planning: { label: "Планування", fg: "var(--color-info)", bg: "rgba(86,182,247,0.12)" },
  awaiting_approval: {
    label: "Чекає схвалення плану",
    fg: "var(--color-honey)",
    bg: "rgba(245,181,68,0.12)",
  },
  running: { label: "Виконання", fg: "var(--color-busy)", bg: "rgba(251,191,36,0.12)" },
  awaiting_review: {
    label: "На твоїй перевірці",
    fg: "var(--color-honey-bright)",
    bg: "rgba(255,201,100,0.14)",
  },
  completed: { label: "Завершено", fg: "var(--color-online)", bg: "rgba(61,220,151,0.12)" },
  failed: { label: "Помилка", fg: "var(--color-danger)", bg: "rgba(251,113,133,0.12)" },
};

/** Пігулка статусу прогону. */
export function RunStatusBadge({ status }: { status: RunStatus }) {
  const meta = RUN_STATUS_META[status] ?? RUN_STATUS_META.planning;
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11.5px] font-medium"
      style={{ color: meta.fg, backgroundColor: meta.bg }}
    >
      <span
        className="h-1.5 w-1.5 rounded-full"
        style={{ backgroundColor: meta.fg, boxShadow: `0 0 7px ${meta.fg}` }}
      />
      {meta.label}
    </span>
  );
}

const TASK_STATUS_META: Record<TaskStatus, { label: string; color: string }> = {
  pending: { label: "У черзі", color: "var(--color-fg-subtle)" },
  in_progress: { label: "Працює", color: "var(--color-busy)" },
  waiting_question: { label: "Чекає відповіді", color: "var(--color-honey)" },
  done: { label: "Готово", color: "var(--color-info)" },
  approved: { label: "Схвалено", color: "var(--color-online)" },
  failed: { label: "Помилка", color: "var(--color-danger)" },
};

/** Крапка + підпис статусу завдання. */
export function TaskStatusBadge({ status }: { status: TaskStatus }) {
  const meta = TASK_STATUS_META[status] ?? TASK_STATUS_META.pending;
  return (
    <span className="inline-flex items-center gap-1.5 text-[12px]" style={{ color: meta.color }}>
      <span
        className="h-2 w-2 rounded-full"
        style={{ backgroundColor: meta.color, boxShadow: `0 0 7px ${meta.color}` }}
      />
      {meta.label}
    </span>
  );
}

/** Тонкий прогрес-бар (виконано/усього). */
export function ProgressBar({ done, total }: { done: number; total: number }) {
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  return (
    <div className="flex items-center gap-3">
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-[var(--color-surface-2)]">
        <div
          className="h-full rounded-full bg-[var(--color-honey)] transition-all"
          style={{ width: `${pct}%`, boxShadow: "0 0 10px rgba(245,181,68,0.5)" }}
        />
      </div>
      <span className="shrink-0 font-mono text-[11px] tabular text-[var(--color-fg-subtle)]">
        {done}/{total}
      </span>
    </div>
  );
}

const PLATFORM_META: Record<Platform, { label: string; fg: string; bg: string }> = {
  youtube: { label: "YouTube", fg: "#ff6b6b", bg: "rgba(255,107,107,0.12)" },
  telegram: { label: "Telegram", fg: "#56b6f7", bg: "rgba(86,182,247,0.12)" },
  instagram: { label: "Instagram", fg: "#e879c8", bg: "rgba(232,121,200,0.12)" },
  other: { label: "Інше", fg: "var(--color-fg-muted)", bg: "rgba(139,149,172,0.12)" },
};

/** Пігулка майданчика публікації. */
export function PlatformBadge({ platform }: { platform: Platform }) {
  const meta = PLATFORM_META[platform] ?? PLATFORM_META.other;
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-medium"
      style={{ color: meta.fg, backgroundColor: meta.bg }}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: meta.fg }} />
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
