"use client";

import { useEffect, useState, type FormEvent } from "react";
import type { KnowledgeSearchHit, KnowledgeSource } from "@swarm/shared";
import { api } from "@/lib/api";
import { useProject } from "@/components/ProjectContext";
import { PageHeader } from "@/components/ui";
import { KnowledgeIcon, TrashIcon, UploadIcon } from "@/components/icons";

function fmtBytes(n: number): string {
  if (n < 1024) return `${n} Б`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} КБ`;
  return `${(n / 1024 / 1024).toFixed(1)} МБ`;
}

export default function KnowledgePage() {
  const project = useProject();
  const [sources, setSources] = useState<KnowledgeSource[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  // Інгест нотатки.
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  const [savingNote, setSavingNote] = useState(false);

  // Інгест теки (на сервері).
  const [dir, setDir] = useState("");
  const [ingestingDir, setIngestingDir] = useState(false);

  // Пошук.
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<KnowledgeSearchHit[] | null>(null);
  const [searching, setSearching] = useState(false);

  async function refresh() {
    try {
      setSources(await api.listKnowledge(project.id));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не вдалося завантажити знання");
    } finally {
      setLoaded(true);
    }
  }

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project.id]);

  async function addNote(e: FormEvent) {
    e.preventDefault();
    if (!text.trim() || savingNote) return;
    setSavingNote(true);
    setError(null);
    setInfo(null);
    try {
      const r = await api.ingestText(project.id, text.trim(), title.trim() || undefined);
      setInfo(`Нотатку проіндексовано: ${r.chunks} чанк(ів).`);
      setText("");
      setTitle("");
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не вдалося проіндексувати");
    } finally {
      setSavingNote(false);
    }
  }

  async function runIngest() {
    if (!dir.trim() || ingestingDir) return;
    setIngestingDir(true);
    setError(null);
    setInfo(null);
    try {
      const r = await api.ingestDir(project.id, dir.trim());
      setInfo(`Інгест завершено: ${r.sources} джерел, ${r.chunks} чанків.`);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не вдалося проіндексувати теку");
    } finally {
      setIngestingDir(false);
    }
  }

  async function search(e: FormEvent) {
    e.preventDefault();
    if (!q.trim()) {
      setHits(null);
      return;
    }
    setSearching(true);
    try {
      setHits(await api.searchKnowledge(project.id, q.trim()));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Помилка пошуку");
    } finally {
      setSearching(false);
    }
  }

  async function remove(id: number) {
    try {
      await api.deleteKnowledge(project.id, id);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не вдалося видалити");
    }
  }

  const totalChunks = sources.reduce((s, x) => s + x.chunkCount, 0);

  return (
    <>
      <PageHeader
        title="База знань проєкту"
        subtitle="Матеріали проєкту індексуються й релевантні шматки автоматично домішуються в промпти агентів — у чатах і в прогонах рою."
        right={
          <div className="flex items-center gap-2 rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] px-3.5 py-2 text-[12px] text-[var(--color-fg-muted)]">
            <KnowledgeIcon width={15} height={15} className="text-[var(--color-honey)]" />
            <span className="font-mono tabular">{sources.length}</span> джерел · <span className="font-mono tabular">{totalChunks}</span> чанків
          </div>
        }
      />

      <div className="space-y-6 px-6 py-7 md:px-10">
        {error && (
          <div className="rounded-xl border border-[var(--color-danger)]/30 bg-[var(--color-danger)]/10 px-4 py-3 text-[13px] text-[var(--color-danger)]">{error}</div>
        )}
        {info && (
          <div className="rounded-xl border border-[var(--color-online)]/30 bg-[var(--color-online)]/10 px-4 py-3 text-[13px] text-[var(--color-online)]">{info}</div>
        )}

        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
          {/* Додати нотатку */}
          <form onSubmit={addNote} className="rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
            <h2 className="mb-3 text-[14px] font-semibold">Додати матеріал (нотатка)</h2>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Назва (необовʼязково)"
              className="mb-2.5 w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-base)] px-3 py-2 text-[13px] text-[var(--color-fg)] placeholder:text-[var(--color-fg-subtle)] focus:border-[var(--color-honey)]/50 focus:outline-none"
            />
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={6}
              placeholder="Встав текст матеріалу: бренд-гайд, опис продукту, типові заперечення, приклади постів…"
              className="w-full resize-none rounded-lg border border-[var(--color-border)] bg-[var(--color-base)] px-3 py-2.5 text-[13px] leading-relaxed text-[var(--color-fg)] placeholder:text-[var(--color-fg-subtle)] focus:border-[var(--color-honey)]/50 focus:outline-none"
            />
            <button type="submit" disabled={!text.trim() || savingNote} className="mt-3 inline-flex items-center gap-2 rounded-xl bg-[var(--color-honey)] px-4 py-2 text-[13px] font-semibold text-[var(--color-ink)] transition-colors hover:bg-[var(--color-honey-bright)] disabled:opacity-60">
              {savingNote ? "Індексую…" : "Проіндексувати"}
            </button>
          </form>

          {/* Інгест теки + пошук */}
          <div className="space-y-5">
            <div className="rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
              <h2 className="mb-3 flex items-center gap-2 text-[14px] font-semibold">
                <UploadIcon width={16} height={16} className="text-[var(--color-honey)]" /> Інгест теки з файлами
              </h2>
              <p className="mb-2.5 text-[12.5px] text-[var(--color-fg-subtle)]">
                Шлях до теки на сервері (.md, .txt). Те саме робить CLI:
                <code className="ml-1 rounded bg-[var(--color-base)] px-1.5 py-0.5 font-mono text-[11px] text-[var(--color-honey)]">npm run knowledge:ingest -- --dir=…</code>
              </p>
              <div className="flex items-end gap-2">
                <input
                  value={dir}
                  onChange={(e) => setDir(e.target.value)}
                  placeholder="C:\\notes\\export"
                  className="flex-1 rounded-lg border border-[var(--color-border)] bg-[var(--color-base)] px-3 py-2 font-mono text-[12px] text-[var(--color-fg)] placeholder:text-[var(--color-fg-subtle)] focus:border-[var(--color-honey)]/50 focus:outline-none"
                />
                <button onClick={runIngest} disabled={!dir.trim() || ingestingDir} className="inline-flex items-center gap-2 rounded-xl bg-[var(--color-honey)] px-4 py-2 text-[13px] font-semibold text-[var(--color-ink)] transition-colors hover:bg-[var(--color-honey-bright)] disabled:opacity-60">
                  {ingestingDir ? "Інгест…" : "Запустити інгест"}
                </button>
              </div>
            </div>

            <form onSubmit={search} className="rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
              <h2 className="mb-3 text-[14px] font-semibold">Пошук по знаннях</h2>
              <div className="flex items-end gap-2">
                <input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Напр.: тон бренду, типові заперечення…"
                  className="flex-1 rounded-lg border border-[var(--color-border)] bg-[var(--color-base)] px-3 py-2 text-[13px] text-[var(--color-fg)] placeholder:text-[var(--color-fg-subtle)] focus:border-[var(--color-honey)]/50 focus:outline-none"
                />
                <button type="submit" disabled={searching} className="rounded-xl border border-[var(--color-border-strong)] px-4 py-2 text-[13px] font-medium text-[var(--color-fg-muted)] transition-colors hover:text-[var(--color-fg)] disabled:opacity-60">
                  {searching ? "Шукаю…" : "Знайти"}
                </button>
              </div>
              {hits && (
                <div className="mt-3 space-y-2">
                  {hits.length === 0 ? (
                    <p className="text-[12.5px] text-[var(--color-fg-subtle)]">Нічого не знайдено.</p>
                  ) : (
                    hits.map((h) => (
                      <div key={h.chunkId} className="rounded-lg border border-[var(--color-border)] bg-[var(--color-base)] p-3">
                        <div className="mb-1 font-mono text-[10px] text-[var(--color-fg-subtle)]">{h.sourceTitle}</div>
                        <p className="line-clamp-3 text-[12.5px] text-[var(--color-fg-muted)]">{h.content}</p>
                      </div>
                    ))
                  )}
                </div>
              )}
            </form>
          </div>
        </div>

        {/* Список джерел */}
        <section>
          <h2 className="mb-3 text-[12px] font-medium uppercase tracking-[0.16em] text-[var(--color-fg-subtle)]">
            Документи {loaded && `· ${sources.length}`}
          </h2>
          {loaded && sources.length === 0 && (
            <div className="rounded-[var(--radius-card)] border border-dashed border-[var(--color-border)] bg-[var(--color-surface)] px-6 py-12 text-center text-[14px] text-[var(--color-fg-muted)]">
              Поки немає джерел. Додай нотатку або запусти інгест теки вище.
            </div>
          )}
          <div className="space-y-2.5">
            {sources.map((s) => (
              <div key={s.id} className="flex items-center gap-3 rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3">
                <span className="grid h-9 w-9 place-items-center rounded-lg bg-[var(--color-honey)]/12 text-[var(--color-honey)]">
                  <KnowledgeIcon width={18} height={18} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[14px] font-medium text-[var(--color-fg)]">{s.title}</p>
                  <p className="font-mono text-[11px] text-[var(--color-fg-subtle)]">
                    {s.kind} · {s.chunkCount} чанків · {fmtBytes(s.bytes)}
                    {s.path && ` · ${s.path}`}
                  </p>
                </div>
                <button onClick={() => remove(s.id)} aria-label="Видалити" className="grid h-8 w-8 place-items-center rounded-lg text-[var(--color-fg-subtle)] transition-colors hover:bg-[var(--color-danger)]/10 hover:text-[var(--color-danger)]">
                  <TrashIcon width={15} height={15} />
                </button>
              </div>
            ))}
          </div>
        </section>
      </div>
    </>
  );
}
