"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import type { ProjectSummary } from "@swarm/shared";
import { api } from "@/lib/api";
import { PageHeader } from "@/components/ui";
import { PlusIcon, ProjectsIcon } from "@/components/icons";

export default function ProjectsPage() {
  const router = useRouter();
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let alive = true;
    api
      .listProjects()
      .then((list) => alive && setProjects(list))
      .catch((e) => alive && setError(e instanceof Error ? e.message : "Помилка"))
      .finally(() => alive && setLoaded(true));
    return () => {
      alive = false;
    };
  }, []);

  async function create(e: FormEvent) {
    e.preventDefault();
    if (!name.trim() || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const project = await api.createProject({ name: name.trim(), description: description.trim() });
      router.push(`/projects/${project.slug}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не вдалося створити проєкт");
      setSubmitting(false);
    }
  }

  return (
    <>
      <PageHeader
        title="Проєкти"
        subtitle="Кожен проєкт — окремий канал чи бренд зі своїми прогонами, контентом, профілем і базою знань. Рій агентів спільний для всіх."
        right={
          <button
            onClick={() => setCreating((v) => !v)}
            className="inline-flex items-center gap-2 rounded-xl bg-[var(--color-honey)] px-4 py-2.5 text-[13.5px] font-semibold text-[var(--color-ink)] transition-colors hover:bg-[var(--color-honey-bright)]"
          >
            <PlusIcon width={16} height={16} /> Новий проєкт
          </button>
        }
      />

      <div className="space-y-6 px-6 py-7 md:px-10">
        {error && (
          <div className="rounded-xl border border-[var(--color-danger)]/30 bg-[var(--color-danger)]/10 px-4 py-3 text-[13px] text-[var(--color-danger)]">
            {error}
          </div>
        )}

        {creating && (
          <form
            onSubmit={create}
            className="rounded-[var(--radius-card)] border border-[var(--color-honey)]/25 bg-gradient-to-br from-[var(--color-honey)]/[0.07] to-transparent p-5"
          >
            <label className="mb-1.5 block text-[13px] font-medium text-[var(--color-fg-muted)]">
              Назва проєкту
            </label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
              placeholder="Напр.: AI ПРОРИВ"
              className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-base)] px-4 py-2.5 text-[14px] text-[var(--color-fg)] placeholder:text-[var(--color-fg-subtle)] focus:border-[var(--color-honey)]/50 focus:outline-none"
            />
            <label className="mb-1.5 mt-3 block text-[13px] font-medium text-[var(--color-fg-muted)]">
              Опис (необовʼязково)
            </label>
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Коротко про канал/бренд"
              className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-base)] px-4 py-2.5 text-[14px] text-[var(--color-fg)] placeholder:text-[var(--color-fg-subtle)] focus:border-[var(--color-honey)]/50 focus:outline-none"
            />
            <button
              type="submit"
              disabled={!name.trim() || submitting}
              className="mt-4 inline-flex items-center gap-2 rounded-xl bg-[var(--color-honey)] px-5 py-2.5 text-[14px] font-semibold text-[var(--color-ink)] transition-colors hover:bg-[var(--color-honey-bright)] disabled:opacity-60"
            >
              {submitting ? "Створюю…" : "Створити проєкт"}
            </button>
          </form>
        )}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {!loaded &&
            [0, 1, 2].map((i) => (
              <div
                key={i}
                className="h-[140px] animate-pulse rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-surface)]"
              />
            ))}

          {loaded &&
            projects.map((p) => (
              <Link
                key={p.id}
                href={`/projects/${p.slug}`}
                className="group flex flex-col gap-3 rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-surface)] p-5 transition-all hover:border-[var(--color-honey)]/40 hover:bg-[var(--color-surface-2)]"
              >
                <div className="flex items-center gap-3">
                  <span className="grid h-10 w-10 place-items-center rounded-xl bg-[var(--color-honey)]/12 text-[var(--color-honey)] ring-1 ring-[var(--color-honey)]/20">
                    <ProjectsIcon width={20} height={20} />
                  </span>
                  <div className="min-w-0">
                    <div className="truncate font-display text-[16px] font-semibold group-hover:text-[var(--color-honey-bright)]">
                      {p.name}
                    </div>
                    <div className="font-mono text-[11px] text-[var(--color-fg-subtle)]">
                      {p.slug}
                    </div>
                  </div>
                </div>
                {p.description && (
                  <p className="line-clamp-2 text-[13px] text-[var(--color-fg-muted)]">
                    {p.description}
                  </p>
                )}
                <div className="mt-auto flex items-center gap-4 border-t border-[var(--color-border)] pt-3 font-mono text-[11px] text-[var(--color-fg-subtle)]">
                  <span>{p.runs} прогонів</span>
                  <span>{p.drafts} чернеток</span>
                  <span>{p.knowledgeSources} джерел знань</span>
                </div>
              </Link>
            ))}
        </div>

        {loaded && projects.length === 0 && !creating && (
          <div className="rounded-[var(--radius-card)] border border-dashed border-[var(--color-border)] bg-[var(--color-surface)] px-6 py-14 text-center">
            <p className="text-[14px] text-[var(--color-fg-muted)]">
              Проєктів ще немає. Створи перший ↑
            </p>
          </div>
        )}
      </div>
    </>
  );
}
