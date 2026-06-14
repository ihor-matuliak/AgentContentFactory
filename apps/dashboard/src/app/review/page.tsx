"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { ReviewItem } from "@swarm/shared";
import { api } from "@/lib/api";
import { Markdown } from "@/components/Markdown";
import { AgentBadge, PageHeader } from "@/components/ui";
import { CheckIcon, RotateIcon } from "@/components/icons";

export default function ReviewPage() {
  const [items, setItems] = useState<ReviewItem[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    try {
      setItems(await api.listReview());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не вдалося завантажити чергу");
    } finally {
      setLoaded(true);
    }
  }

  useEffect(() => {
    void refresh();
    // Власник зайшов перевіряти — гасимо лічильник непрочитаних сповіщень.
    void api.markAllEventsRead().catch(() => {});
    const t = setInterval(refresh, 6000);
    return () => clearInterval(t);
  }, []);

  return (
    <>
      <PageHeader
        title="На перевірці"
        subtitle="Готові результати рою чекають на твоє слово. Схвали — або поверни на доопрацювання з коментарем."
      />

      <div className="space-y-5 px-6 py-7 md:px-10">
        {error && (
          <div className="rounded-xl border border-[var(--color-danger)]/30 bg-[var(--color-danger)]/10 px-4 py-3 text-[13px] text-[var(--color-danger)]">
            {error}
          </div>
        )}

        <h2 className="text-[12px] font-medium uppercase tracking-[0.16em] text-[var(--color-fg-subtle)]">
          Результати на перевірці {loaded && `· ${items.length}`}
        </h2>

        {!loaded &&
          [0, 1].map((i) => (
            <div
              key={i}
              className="h-44 animate-pulse rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-surface)]"
            />
          ))}

        {loaded && items.length === 0 && (
          <div className="rounded-[var(--radius-card)] border border-dashed border-[var(--color-border)] bg-[var(--color-surface)] px-6 py-14 text-center">
            <p className="text-[14px] text-[var(--color-fg-muted)]">
              Черга порожня — рій нічого не чекає на перевірку.
            </p>
            <Link
              href="/runs"
              className="mt-3 inline-block text-[13px] text-[var(--color-honey)] hover:text-[var(--color-honey-bright)]"
            >
              Поставити нову ціль →
            </Link>
          </div>
        )}

        {loaded &&
          items.map((item) => (
            <ReviewCard
              key={item.task.id}
              item={item}
              onDone={refresh}
            />
          ))}
      </div>
    </>
  );
}

function ReviewCard({ item, onDone }: { item: ReviewItem; onDone: () => void }) {
  const { task, run } = item;
  const [comment, setComment] = useState("");
  const [reworking, setReworking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const name = task.agentName ?? task.agentSlug;

  async function decide(decision: "approve" | "rework") {
    if (busy) return;
    if (decision === "rework" && !comment.trim()) {
      setReworking(true);
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      await api.reviewTask(run.id, task.id, decision, comment.trim() || undefined);
      onDone();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Не вдалося зберегти рішення");
      setBusy(false);
    }
  }

  return (
    <div className="rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-surface)]">
      {/* Шапка картки */}
      <div className="flex items-start gap-3 border-b border-[var(--color-border)] px-5 py-4">
        <AgentBadge name={name} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="font-display text-[15px] font-semibold">{name}</span>
            {task.criticVerdict === "approved" && (
              <span className="inline-flex items-center gap-1 text-[11.5px] text-[var(--color-online)]">
                <CheckIcon width={13} height={13} /> схвалено Критиком
              </span>
            )}
          </div>
          <p className="mt-0.5 text-[13px] text-[var(--color-fg-muted)]">
            {task.description}
          </p>
          <Link
            href={`/runs/${run.id}`}
            className="mt-1 inline-block font-mono text-[11px] text-[var(--color-fg-subtle)] hover:text-[var(--color-honey)]"
          >
            прогін #{run.id} · {run.goal}
          </Link>
        </div>
      </div>

      {/* Результат */}
      <div className="px-5 py-4">
        <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-base)] p-4">
          <Markdown>{task.result}</Markdown>
        </div>
        {task.criticComment && (
          <p className="mt-3 text-[12.5px] text-[var(--color-fg-subtle)]">
            <span className="font-medium text-[var(--color-fg-muted)]">Критик:</span>{" "}
            {task.criticComment}
          </p>
        )}
      </div>

      {/* Дії */}
      <div className="border-t border-[var(--color-border)] px-5 py-4">
        {reworking && (
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            rows={2}
            autoFocus
            placeholder="Що саме доопрацювати? Цей коментар отримає виконавець…"
            className="mb-3 w-full resize-none rounded-lg border border-[var(--color-border)] bg-[var(--color-base)] px-3 py-2 text-[13px] text-[var(--color-fg)] placeholder:text-[var(--color-fg-subtle)] focus:border-[var(--color-honey)]/50 focus:outline-none"
          />
        )}
        {err && <p className="mb-2 text-[12.5px] text-[var(--color-danger)]">{err}</p>}
        <div className="flex items-center gap-2.5">
          <button
            onClick={() => decide("approve")}
            disabled={busy}
            className="inline-flex items-center gap-2 rounded-lg bg-[var(--color-online)]/90 px-4 py-2 text-[13px] font-semibold text-[var(--color-ink)] transition-colors hover:bg-[var(--color-online)] disabled:opacity-60"
          >
            <CheckIcon width={15} height={15} /> Схвалити
          </button>
          <button
            onClick={() => decide("rework")}
            disabled={busy}
            className="inline-flex items-center gap-2 rounded-lg border border-[var(--color-border-strong)] px-4 py-2 text-[13px] font-semibold text-[var(--color-fg-muted)] transition-colors hover:border-[var(--color-busy)]/50 hover:text-[var(--color-fg)] disabled:opacity-60"
          >
            <RotateIcon width={15} height={15} />
            {reworking ? "Надіслати на доопрацювання" : "На доопрацювання"}
          </button>
        </div>
      </div>
    </div>
  );
}
