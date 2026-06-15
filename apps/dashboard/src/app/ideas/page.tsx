"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import type { Idea, ProjectSummary } from "@swarm/shared";
import { api } from "@/lib/api";
import { PageHeader } from "@/components/ui";
import { IdeaIcon, PlayIcon, PlusIcon, TrashIcon } from "@/components/icons";

function timeAgo(iso: string): string {
  const min = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (min < 1) return "щойно";
  if (min < 60) return `${min} хв тому`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h} год тому`;
  return `${Math.floor(h / 24)} дн тому`;
}

export default function IdeasPage() {
  const router = useRouter();
  const [ideas, setIdeas] = useState<Idea[]>([]);
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [body, setBody] = useState("");
  const [projectId, setProjectId] = useState<number | "">("");
  const [busyId, setBusyId] = useState<number | null>(null);

  async function refresh() {
    try {
      const [list, projs] = await Promise.all([api.listIdeas(), api.listProjects()]);
      setIdeas(list);
      setProjects(projs);
      if (projectId === "" && projs[0]) setProjectId(projs[0].id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не вдалося завантажити");
    } finally {
      setLoaded(true);
    }
  }

  useEffect(() => {
    void refresh();
    const t = setInterval(refresh, 8000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function add(e: FormEvent) {
    e.preventDefault();
    if (!body.trim()) return;
    try {
      await api.createIdea(body.trim(), projectId === "" ? null : projectId);
      setBody("");
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не вдалося додати");
    }
  }

  async function convert(idea: Idea) {
    setBusyId(idea.id);
    try {
      const run = await api.convertIdea(idea.id, projectId === "" ? undefined : projectId);
      const project = projects.find((p) => p.id === run.projectId);
      router.push(project ? `/projects/${project.slug}/runs/${run.id}` : `/`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не вдалося перетворити");
      setBusyId(null);
    }
  }

  async function archive(id: number) {
    setBusyId(id);
    try {
      await api.archiveIdea(id);
      await refresh();
    } finally {
      setBusyId(null);
    }
  }

  const active = ideas.filter((i) => i.status !== "archived");

  return (
    <>
      <PageHeader
        title="Інбокс ідей"
        subtitle="Швидкі ідеї з дашборда чи Telegram (/idea …). Один клік — і ідея перетворюється на прогін рою."
      />

      <div className="mx-auto max-w-3xl space-y-5 px-6 py-7 md:px-10">
        <form
          onSubmit={add}
          className="rounded-[var(--radius-card)] border border-[var(--color-honey)]/25 bg-gradient-to-br from-[var(--color-honey)]/[0.07] to-transparent p-4"
        >
          <div className="flex items-end gap-3">
            <div className="flex-1">
              <label className="mb-1.5 flex items-center gap-2 text-[13px] font-medium text-[var(--color-fg-muted)]">
                <IdeaIcon width={15} height={15} className="text-[var(--color-honey)]" /> Нова ідея
              </label>
              <input
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder="Напр.: серія Reels про ранкові звички"
                className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-base)] px-3 py-2.5 text-[14px] text-[var(--color-fg)] placeholder:text-[var(--color-fg-subtle)] focus:border-[var(--color-honey)]/50 focus:outline-none"
              />
            </div>
            <select
              value={projectId}
              onChange={(e) => setProjectId(e.target.value ? Number(e.target.value) : "")}
              className="rounded-lg border border-[var(--color-border)] bg-[var(--color-base)] px-3 py-2.5 text-[13px] text-[var(--color-fg-muted)] focus:border-[var(--color-honey)]/50 focus:outline-none"
            >
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            <button
              type="submit"
              disabled={!body.trim()}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--color-honey)] px-4 py-2.5 text-[13px] font-semibold text-[var(--color-ink)] transition-colors hover:bg-[var(--color-honey-bright)] disabled:opacity-60"
            >
              <PlusIcon width={15} height={15} /> Додати
            </button>
          </div>
        </form>

        {error && (
          <div className="rounded-xl border border-[var(--color-danger)]/30 bg-[var(--color-danger)]/10 px-4 py-3 text-[13px] text-[var(--color-danger)]">
            {error}
          </div>
        )}

        {loaded && active.length === 0 && (
          <div className="rounded-[var(--radius-card)] border border-dashed border-[var(--color-border)] bg-[var(--color-surface)] px-6 py-12 text-center text-[14px] text-[var(--color-fg-muted)]">
            Інбокс порожній. Закинь ідею вище або напиши боту в Telegram «/idea …».
          </div>
        )}

        <div className="space-y-2.5">
          {active.map((idea) => (
            <div
              key={idea.id}
              className={[
                "flex flex-wrap items-center gap-3 rounded-[var(--radius-card)] border bg-[var(--color-surface)] px-4 py-3",
                idea.status === "converted"
                  ? "border-[var(--color-online)]/30"
                  : "border-[var(--color-border)]",
              ].join(" ")}
            >
              <div className="min-w-0 flex-1">
                <p className="text-[14px] text-[var(--color-fg)]">{idea.body}</p>
                <div className="mt-1 flex items-center gap-2 font-mono text-[11px] text-[var(--color-fg-subtle)]">
                  <span>{timeAgo(idea.createdAt)}</span>
                  {idea.source === "telegram" && <span>· Telegram</span>}
                  {idea.projectName && <span>· {idea.projectName}</span>}
                  {idea.status === "converted" && (
                    <span className="text-[var(--color-online)]">· у прогоні #{idea.runId}</span>
                  )}
                </div>
              </div>
              {idea.status === "new" && (
                <>
                  <button
                    onClick={() => convert(idea)}
                    disabled={busyId === idea.id}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--color-honey)] px-3 py-1.5 text-[12.5px] font-semibold text-[var(--color-ink)] transition-colors hover:bg-[var(--color-honey-bright)] disabled:opacity-60"
                  >
                    <PlayIcon width={13} height={13} /> У прогін
                  </button>
                  <button
                    onClick={() => archive(idea.id)}
                    disabled={busyId === idea.id}
                    aria-label="Архівувати"
                    className="grid h-8 w-8 place-items-center rounded-lg text-[var(--color-fg-subtle)] transition-colors hover:bg-[var(--color-danger)]/10 hover:text-[var(--color-danger)] disabled:opacity-60"
                  >
                    <TrashIcon width={15} height={15} />
                  </button>
                </>
              )}
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
