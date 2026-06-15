"use client";

import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import type { ContentPlanItem, Platform } from "@swarm/shared";
import { api } from "@/lib/api";
import { PageHeader, PlatformBadge } from "@/components/ui";
import { CalendarIcon, CheckIcon, PlusIcon, RotateIcon, TrashIcon } from "@/components/icons";

const PLATFORMS: Platform[] = ["youtube", "telegram", "instagram", "other"];

function fmtDateHeading(date: string): string {
  const d = new Date(`${date}T00:00:00`);
  return d.toLocaleDateString("uk-UA", {
    weekday: "short",
    day: "numeric",
    month: "long",
  });
}

export default function CalendarPage() {
  const [items, setItems] = useState<ContentPlanItem[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Композер нового запису.
  const [title, setTitle] = useState("");
  const [platform, setPlatform] = useState<Platform>("youtube");
  const [date, setDate] = useState("");
  const [adding, setAdding] = useState(false);

  async function refresh() {
    try {
      setItems(await api.listPlan());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не вдалося завантажити план");
    } finally {
      setLoaded(true);
    }
  }

  useEffect(() => {
    void refresh();
    const t = setInterval(refresh, 8000);
    return () => clearInterval(t);
  }, []);

  async function add(e: FormEvent) {
    e.preventDefault();
    if (!title.trim() || adding) return;
    setAdding(true);
    setError(null);
    try {
      await api.createPlanItem({
        title: title.trim(),
        platform,
        scheduledFor: date || null,
      });
      setTitle("");
      setDate("");
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не вдалося додати");
    } finally {
      setAdding(false);
    }
  }

  // Групуємо за датою; без дати — окремо в кінці.
  const dated = items.filter((i) => i.scheduledFor);
  const undated = items.filter((i) => !i.scheduledFor);
  const groups = new Map<string, ContentPlanItem[]>();
  for (const it of dated) {
    const key = it.scheduledFor as string;
    (groups.get(key) ?? groups.set(key, []).get(key)!).push(it);
  }
  const sortedDates = [...groups.keys()].sort();

  const published = items.filter((i) => i.status === "published").length;

  return (
    <>
      <PageHeader
        title="Календар контенту"
        subtitle="Що і коли публікуємо на майданчиках. Схвалені завдання-публікації потрапляють сюди автоматично — лишається призначити дату."
        right={
          <div className="flex items-center gap-2 rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] px-3.5 py-2 text-[12px] text-[var(--color-fg-muted)]">
            <CalendarIcon width={15} height={15} className="text-[var(--color-honey)]" />
            <span className="font-mono tabular">{published}/{items.length}</span> опубліковано
          </div>
        }
      />

      <div className="space-y-6 px-6 py-7 md:px-10">
        {/* Композер */}
        <form
          onSubmit={add}
          className="flex flex-wrap items-end gap-3 rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-surface)] p-4"
        >
          <div className="min-w-[220px] flex-1">
            <label className="mb-1.5 block text-[12px] font-medium text-[var(--color-fg-muted)]">
              Що публікуємо
            </label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Напр.: Shorts «5 км за 6 тижнів»"
              className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-base)] px-3 py-2 text-[13px] text-[var(--color-fg)] placeholder:text-[var(--color-fg-subtle)] focus:border-[var(--color-honey)]/50 focus:outline-none"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-[12px] font-medium text-[var(--color-fg-muted)]">
              Майданчик
            </label>
            <select
              value={platform}
              onChange={(e) => setPlatform(e.target.value as Platform)}
              className="rounded-lg border border-[var(--color-border)] bg-[var(--color-base)] px-3 py-2 text-[13px] text-[var(--color-fg)] focus:border-[var(--color-honey)]/50 focus:outline-none"
            >
              {PLATFORMS.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1.5 block text-[12px] font-medium text-[var(--color-fg-muted)]">
              Дата
            </label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="rounded-lg border border-[var(--color-border)] bg-[var(--color-base)] px-3 py-2 text-[13px] text-[var(--color-fg)] focus:border-[var(--color-honey)]/50 focus:outline-none"
            />
          </div>
          <button
            type="submit"
            disabled={!title.trim() || adding}
            className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--color-honey)] px-4 py-2 text-[13px] font-semibold text-[var(--color-ink)] transition-colors hover:bg-[var(--color-honey-bright)] disabled:opacity-60"
          >
            <PlusIcon width={15} height={15} />
            Додати
          </button>
        </form>

        {error && (
          <div className="rounded-xl border border-[var(--color-danger)]/30 bg-[var(--color-danger)]/10 px-4 py-3 text-[13px] text-[var(--color-danger)]">
            {error}
          </div>
        )}

        {loaded && items.length === 0 && (
          <div className="rounded-[var(--radius-card)] border border-dashed border-[var(--color-border)] bg-[var(--color-surface)] px-6 py-12 text-center text-[14px] text-[var(--color-fg-muted)]">
            Контент-план порожній. Додай запис вище або схвали завдання-публікацію в прогоні.
          </div>
        )}

        {!loaded &&
          [0, 1].map((i) => (
            <div
              key={i}
              className="h-28 animate-pulse rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-surface)]"
            />
          ))}

        {sortedDates.map((d) => (
          <section key={d}>
            <h2 className="mb-2.5 flex items-center gap-2 text-[12px] font-semibold uppercase tracking-[0.14em] text-[var(--color-fg-subtle)]">
              <span className="h-1.5 w-1.5 rounded-full bg-[var(--color-honey)]" />
              {fmtDateHeading(d)}
            </h2>
            <div className="space-y-2.5">
              {groups.get(d)!.map((it) => (
                <PlanRow key={it.id} item={it} onChange={refresh} />
              ))}
            </div>
          </section>
        ))}

        {undated.length > 0 && (
          <section>
            <h2 className="mb-2.5 text-[12px] font-semibold uppercase tracking-[0.14em] text-[var(--color-fg-subtle)]">
              Без дати · {undated.length}
            </h2>
            <div className="space-y-2.5">
              {undated.map((it) => (
                <PlanRow key={it.id} item={it} onChange={refresh} />
              ))}
            </div>
          </section>
        )}
      </div>
    </>
  );
}

function PlanRow({ item, onChange }: { item: ContentPlanItem; onChange: () => void }) {
  const [busy, setBusy] = useState(false);
  const published = item.status === "published";

  async function patch(p: Parameters<typeof api.updatePlanItem>[1]) {
    setBusy(true);
    try {
      await api.updatePlanItem(item.id, p);
      onChange();
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    try {
      await api.deletePlanItem(item.id);
      onChange();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className={[
        "flex flex-wrap items-center gap-3 rounded-[var(--radius-card)] border bg-[var(--color-surface)] px-4 py-3",
        published ? "border-[var(--color-online)]/30" : "border-[var(--color-border)]",
      ].join(" ")}
    >
      <PlatformBadge platform={item.platform} />
      <div className="min-w-0 flex-1">
        <p
          className={[
            "text-[14px] font-medium",
            published ? "text-[var(--color-fg-muted)] line-through" : "text-[var(--color-fg)]",
          ].join(" ")}
        >
          {item.title}
        </p>
        {item.runId && (
          <Link
            href={`/runs/${item.runId}`}
            className="font-mono text-[10px] text-[var(--color-fg-subtle)] hover:text-[var(--color-honey)]"
          >
            з прогону #{item.runId}
          </Link>
        )}
      </div>

      <input
        type="date"
        value={item.scheduledFor ?? ""}
        disabled={busy}
        onChange={(e) => patch({ scheduledFor: e.target.value || null })}
        className="rounded-lg border border-[var(--color-border)] bg-[var(--color-base)] px-2.5 py-1.5 font-mono text-[12px] text-[var(--color-fg-muted)] focus:border-[var(--color-honey)]/50 focus:outline-none"
      />

      <button
        onClick={() => patch({ status: published ? "planned" : "published" })}
        disabled={busy}
        className={[
          "inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[12px] font-medium transition-colors disabled:opacity-60",
          published
            ? "border-[var(--color-border-strong)] text-[var(--color-fg-muted)] hover:text-[var(--color-fg)]"
            : "border-[var(--color-online)]/40 text-[var(--color-online)] hover:bg-[var(--color-online)]/10",
        ].join(" ")}
      >
        {published ? (
          <>
            <RotateIcon width={13} height={13} /> Запланувати
          </>
        ) : (
          <>
            <CheckIcon width={13} height={13} /> Опубліковано
          </>
        )}
      </button>

      <button
        onClick={remove}
        disabled={busy}
        aria-label="Видалити"
        className="grid h-8 w-8 place-items-center rounded-lg text-[var(--color-fg-subtle)] transition-colors hover:bg-[var(--color-danger)]/10 hover:text-[var(--color-danger)] disabled:opacity-60"
      >
        <TrashIcon width={15} height={15} />
      </button>
    </div>
  );
}
