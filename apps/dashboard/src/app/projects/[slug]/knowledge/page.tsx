"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent,
  type FormEvent,
} from "react";
import type {
  AgentSummary,
  KnowledgeCounts,
  KnowledgeSearchHit,
  KnowledgeSource,
  KnowledgeSourceType,
} from "@swarm/shared";
import { api } from "@/lib/api";
import { useProject } from "@/components/ProjectContext";
import { PageHeader } from "@/components/ui";
import {
  DocumentIcon,
  PaletteIcon,
  PhotoIcon,
  TrashIcon,
  UploadIcon,
} from "@/components/icons";

/** Метадані вкладок: підписи, іконки, дозволені формати, тексти дропзони. */
const TABS: Record<
  KnowledgeSourceType,
  {
    label: string;
    Icon: typeof DocumentIcon;
    accept: string;
    dropTitle: string;
    dropHint: string;
    emptyList: string;
    isImage: boolean;
  }
> = {
  document: {
    label: "Документи",
    Icon: DocumentIcon,
    accept: ".md,.markdown,.txt,.rtf,.org,.pdf,.csv,.tsv,.json",
    dropTitle:
      "Тексти, статті, PDF, нотатки. Індексуються у векторну базу — агенти знаходять релевантні шматки за змістом.",
    dropHint: ".md, .markdown, .txt, .rtf, .org, .pdf, .csv, .tsv, .json",
    emptyList: "Поки немає документів.",
    isImage: false,
  },
  cover_photo: {
    label: "Фото для обкладинок",
    Icon: PhotoIcon,
    accept: ".png,.jpg,.jpeg,.webp,.gif",
    dropTitle:
      "Зображення, які Дизайнер використовує прямо в обкладинках: твої фото, продуктові знімки, іконки.",
    dropHint: ".png, .jpg, .jpeg, .webp, .gif",
    emptyList: "Поки немає фото.",
    isImage: true,
  },
  style_reference: {
    label: "Референси стилю",
    Icon: PaletteIcon,
    accept: ".png,.jpg,.jpeg,.webp,.gif",
    dropTitle:
      "Як повинні виглядати обкладинки: палітра, типографіка, настрій. Дизайнер копіює візуальний стиль.",
    dropHint: ".png, .jpg, .jpeg, .webp, .gif",
    emptyList: "Поки немає референсів стилю.",
    isImage: true,
  },
};

const TAB_ORDER: KnowledgeSourceType[] = ["document", "cover_photo", "style_reference"];

function fmtBytes(n: number): string {
  if (n < 1024) return `${n} Б`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} КБ`;
  return `${(n / 1024 / 1024).toFixed(1)} МБ`;
}

export default function KnowledgePage() {
  const project = useProject();
  const [tab, setTab] = useState<KnowledgeSourceType>("document");
  const meta = TABS[tab];

  const [sources, setSources] = useState<KnowledgeSource[]>([]);
  const [counts, setCounts] = useState<KnowledgeCounts>({
    document: 0,
    cover_photo: 0,
    style_reference: 0,
  });
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const [agents, setAgents] = useState<AgentSummary[]>([]);

  // Стан завантаження — ізольований по вкладці (очищається при перемиканні).
  const [files, setFiles] = useState<File[]>([]);
  const [selectedAgents, setSelectedAgents] = useState<string[]>([]);
  const [dragActive, setDragActive] = useState(false);
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Пошук (лише на вкладці «Документи»).
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<KnowledgeSearchHit[] | null>(null);
  const [searching, setSearching] = useState(false);

  async function refresh(forTab: KnowledgeSourceType) {
    try {
      const { sources: list, counts: c } = await api.listKnowledge(project.id, forTab);
      setSources(list);
      setCounts(c);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не вдалося завантажити знання");
    } finally {
      setLoaded(true);
    }
  }

  useEffect(() => {
    api.listAgents().then(setAgents).catch(() => {});
  }, []);

  useEffect(() => {
    setLoaded(false);
    void refresh(tab);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project.id, tab]);

  /** Перемикання вкладки: чистимо вибір файлів/агентів і пошук (щоб не змішати). */
  function switchTab(next: KnowledgeSourceType) {
    if (next === tab) return;
    setTab(next);
    setFiles([]);
    setSelectedAgents([]);
    setHits(null);
    setQ("");
    setError(null);
    setInfo(null);
  }

  function addFiles(list: FileList | null) {
    if (!list || list.length === 0) return;
    setFiles((prev) => [...prev, ...Array.from(list)]);
    setInfo(null);
    setError(null);
  }

  function onDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragActive(false);
    addFiles(e.dataTransfer.files);
  }

  function toggleAgent(slug: string) {
    setSelectedAgents((prev) =>
      prev.includes(slug) ? prev.filter((s) => s !== slug) : [...prev, slug],
    );
  }

  async function upload() {
    if (files.length === 0 || uploading) return;
    setUploading(true);
    setError(null);
    setInfo(null);
    try {
      const r = await api.uploadKnowledge(project.id, files, tab, selectedAgents);
      setInfo(
        meta.isImage
          ? `Завантажено файлів: ${r.sources}.`
          : `Проіндексовано: ${r.sources} джерел, ${r.chunks} чанків.`,
      );
      setFiles([]);
      setSelectedAgents([]);
      await refresh(tab);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не вдалося завантажити файли");
    } finally {
      setUploading(false);
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
    } catch (e) {
      setError(e instanceof Error ? e.message : "Помилка пошуку");
    } finally {
      setSearching(false);
    }
  }

  async function remove(id: number) {
    try {
      await api.deleteKnowledge(project.id, id);
      await refresh(tab);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не вдалося видалити");
    }
  }

  const totalChunks = useMemo(
    () => sources.reduce((s, x) => s + x.chunkCount, 0),
    [sources],
  );

  return (
    <>
      <PageHeader
        title="База знань проєкту"
        subtitle={`Матеріали проєкту «${project.name}». Знання ізольовані по проєкту — інші проєкти їх не бачать.`}
        right={
          <div className="flex items-center gap-2 rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] px-3.5 py-2 text-[12px] text-[var(--color-fg-muted)]">
            <span className="font-mono tabular text-[var(--color-fg)]">
              {counts.document + counts.cover_photo + counts.style_reference}
            </span>{" "}
            джерел
            {tab === "document" && (
              <>
                {" · "}
                <span className="font-mono tabular text-[var(--color-fg)]">{totalChunks}</span>{" "}
                чанків
              </>
            )}
          </div>
        }
      />

      <div className="space-y-6 px-6 py-7 md:px-10">
        {/* Вкладки з лічильниками */}
        <div role="tablist" aria-label="Категорії матеріалів" className="flex flex-wrap gap-1 border-b border-[var(--color-border)]">
          {TAB_ORDER.map((t) => {
            const m = TABS[t];
            const active = t === tab;
            return (
              <button
                key={t}
                role="tab"
                aria-selected={active}
                onClick={() => switchTab(t)}
                className={[
                  "relative -mb-px inline-flex items-center gap-2 px-4 py-2.5 text-[13.5px] font-medium transition-colors",
                  active
                    ? "text-[var(--color-honey)]"
                    : "text-[var(--color-fg-muted)] hover:text-[var(--color-fg)]",
                ].join(" ")}
              >
                <m.Icon width={16} height={16} />
                {m.label}
                <span
                  className={[
                    "rounded-full px-1.5 py-0.5 font-mono text-[11px] tabular",
                    active
                      ? "bg-[var(--color-honey)]/15 text-[var(--color-honey)]"
                      : "bg-[var(--color-surface-2)] text-[var(--color-fg-subtle)]",
                  ].join(" ")}
                >
                  {counts[t]}
                </span>
                {active && (
                  <span className="absolute inset-x-0 -bottom-px h-0.5 rounded-full bg-[var(--color-honey)]" />
                )}
              </button>
            );
          })}
        </div>

        {error && (
          <div role="alert" className="rounded-xl border border-[var(--color-danger)]/30 bg-[var(--color-danger)]/10 px-4 py-3 text-[13px] text-[var(--color-danger)]">
            {error}
          </div>
        )}
        {info && (
          <div className="rounded-xl border border-[var(--color-online)]/30 bg-[var(--color-online)]/10 px-4 py-3 text-[13px] text-[var(--color-online)]">
            {info}
          </div>
        )}

        {/* Дропзона + селектор агентів + кнопка дії */}
        <section className="rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
          <input
            ref={inputRef}
            type="file"
            multiple
            accept={meta.accept}
            className="hidden"
            onChange={(e) => {
              addFiles(e.target.files);
              e.target.value = "";
            }}
          />

          <div
            onClick={() => inputRef.current?.click()}
            onDragOver={(e) => {
              e.preventDefault();
              setDragActive(true);
            }}
            onDragLeave={() => setDragActive(false)}
            onDrop={onDrop}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                inputRef.current?.click();
              }
            }}
            className={[
              "flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed px-6 py-10 text-center transition-colors",
              dragActive
                ? "border-[var(--color-honey)] bg-[var(--color-honey)]/[0.06]"
                : "border-[var(--color-border-strong)] hover:border-[var(--color-honey)]/50 hover:bg-[var(--color-surface-2)]/40",
            ].join(" ")}
          >
            <span className="grid h-12 w-12 place-items-center rounded-xl bg-[var(--color-honey)]/12 text-[var(--color-honey)]">
              <UploadIcon width={22} height={22} />
            </span>
            <p className="mt-4 max-w-xl text-[13.5px] leading-relaxed text-[var(--color-fg-muted)]">
              {meta.dropTitle}
            </p>
            <p className="mt-3 text-[13px] font-medium text-[var(--color-fg)]">
              Перетягни файли або натисни, щоб вибрати.{" "}
              <span className="font-mono text-[12px] text-[var(--color-fg-subtle)]">до 50 МБ на файл</span>
            </p>
            <p className="mt-1 font-mono text-[11px] text-[var(--color-fg-subtle)]">{meta.dropHint}</p>
          </div>

          {/* Обрані файли */}
          {files.length > 0 && (
            <ul className="mt-4 flex flex-wrap gap-2">
              {files.map((f, i) => (
                <li
                  key={`${f.name}-${i}`}
                  className="inline-flex items-center gap-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-base)] py-1.5 pl-3 pr-1.5 text-[12.5px]"
                >
                  <span className="max-w-[220px] truncate text-[var(--color-fg)]">{f.name}</span>
                  <span className="font-mono text-[11px] text-[var(--color-fg-subtle)]">{fmtBytes(f.size)}</span>
                  <button
                    onClick={() => setFiles((prev) => prev.filter((_, j) => j !== i))}
                    aria-label={`Прибрати ${f.name}`}
                    className="grid h-5 w-5 place-items-center rounded text-[var(--color-fg-subtle)] hover:bg-[var(--color-danger)]/10 hover:text-[var(--color-danger)]"
                  >
                    <TrashIcon width={13} height={13} />
                  </button>
                </li>
              ))}
            </ul>
          )}

          {/* Селектор видимості для агентів */}
          <div className="mt-5 border-t border-[var(--color-border)] pt-4">
            <p className="text-[13px] text-[var(--color-fg-muted)]">
              Яким агентам видно ці матеріали?{" "}
              <span className="text-[var(--color-fg-subtle)]">
                (якщо нічого не позначено — видно ВСІМ агентам проєкту)
              </span>
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {agents.map((a) => {
                const on = selectedAgents.includes(a.slug);
                return (
                  <button
                    key={a.slug}
                    onClick={() => toggleAgent(a.slug)}
                    aria-pressed={on}
                    className={[
                      "rounded-full border px-3 py-1.5 text-[12.5px] font-medium transition-colors",
                      on
                        ? "border-[var(--color-honey)] bg-[var(--color-honey)]/12 text-[var(--color-honey)]"
                        : "border-[var(--color-border-strong)] text-[var(--color-fg-muted)] hover:text-[var(--color-fg)]",
                    ].join(" ")}
                  >
                    {a.name}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Кнопка дії */}
          <button
            onClick={upload}
            disabled={files.length === 0 || uploading}
            className={[
              "mt-5 w-full rounded-xl px-5 py-3 text-[14px] font-semibold transition-colors",
              files.length === 0 || uploading
                ? "cursor-not-allowed bg-[var(--color-surface-2)] text-[var(--color-fg-subtle)]"
                : "bg-[var(--color-honey)] text-[var(--color-ink)] hover:bg-[var(--color-honey-bright)]",
            ].join(" ")}
          >
            {uploading
              ? "Завантажую…"
              : files.length === 0
              ? "Спочатку додай файли"
              : `Завантажити ${files.length} файл${files.length === 1 ? "" : files.length < 5 ? "и" : "ів"}`}
          </button>
        </section>

        {/* Пошук — лише для документів */}
        {tab === "document" && (
          <form onSubmit={search} className="rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
            <h2 className="mb-3 text-[14px] font-semibold">Пошук за знаннями</h2>
            <div className="flex items-end gap-2">
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Наприклад: сценарій для рілса"
                className="flex-1 rounded-lg border border-[var(--color-border)] bg-[var(--color-base)] px-3 py-2 text-[13px] text-[var(--color-fg)] placeholder:text-[var(--color-fg-subtle)] focus:border-[var(--color-honey)]/50 focus:outline-none"
              />
              <button
                type="submit"
                disabled={searching}
                className="rounded-xl border border-[var(--color-border-strong)] px-4 py-2 text-[13px] font-medium text-[var(--color-fg-muted)] transition-colors hover:text-[var(--color-fg)] disabled:opacity-60"
              >
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
        )}

        {/* Список матеріалів вкладки */}
        <section>
          <h2 className="mb-3 flex items-center gap-2 text-[13px] font-semibold text-[var(--color-fg)]">
            <meta.Icon width={16} height={16} className="text-[var(--color-honey)]" />
            {meta.label}
            <span className="font-mono text-[12px] tabular text-[var(--color-fg-subtle)]">({counts[tab]})</span>
          </h2>

          {!loaded ? (
            <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-20 animate-pulse rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-surface)]" />
              ))}
            </div>
          ) : sources.length === 0 ? (
            <div className="rounded-[var(--radius-card)] border border-dashed border-[var(--color-border)] bg-[var(--color-surface)] px-6 py-12 text-center text-[14px] text-[var(--color-fg-muted)]">
              {meta.emptyList}
            </div>
          ) : meta.isImage ? (
            // Сітка прев'ю для зображень.
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {sources.map((s) => (
                <figure key={s.id} className="group relative overflow-hidden rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-base)]">
                  <div className="aspect-[4/3] w-full overflow-hidden bg-[var(--color-surface-2)]">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={`${api.backendUrl}${s.url}`}
                      alt={s.title}
                      loading="lazy"
                      className="h-full w-full object-cover"
                    />
                  </div>
                  <figcaption className="flex items-center gap-2 px-3 py-2">
                    <span className="min-w-0 flex-1 truncate text-[12.5px] text-[var(--color-fg)]" title={s.title}>
                      {s.title}
                    </span>
                    {s.visibleToAgents.length > 0 && (
                      <span
                        className="shrink-0 rounded-full border border-[var(--color-border-strong)] px-1.5 font-mono text-[10px] text-[var(--color-fg-subtle)]"
                        title={`Видно агентам: ${s.visibleToAgents.join(", ")}`}
                      >
                        {s.visibleToAgents.length} агент.
                      </span>
                    )}
                    <button
                      onClick={() => remove(s.id)}
                      aria-label={`Видалити ${s.title}`}
                      className="grid h-7 w-7 shrink-0 place-items-center rounded-lg text-[var(--color-fg-subtle)] transition-colors hover:bg-[var(--color-danger)]/10 hover:text-[var(--color-danger)]"
                    >
                      <TrashIcon width={14} height={14} />
                    </button>
                  </figcaption>
                </figure>
              ))}
            </div>
          ) : (
            // Рядки для документів.
            <div className="space-y-2.5">
              {sources.map((s) => (
                <div key={s.id} className="flex items-center gap-3 rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3">
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-[var(--color-honey)]/12 text-[var(--color-honey)]">
                    <DocumentIcon width={18} height={18} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[14px] font-medium text-[var(--color-fg)]">{s.title}</p>
                    <p className="font-mono text-[11px] text-[var(--color-fg-subtle)]">
                      {s.chunkCount} чанків · {fmtBytes(s.bytes)}
                      {s.visibleToAgents.length > 0 && ` · видно: ${s.visibleToAgents.join(", ")}`}
                    </p>
                  </div>
                  <button
                    onClick={() => remove(s.id)}
                    aria-label={`Видалити ${s.title}`}
                    className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-[var(--color-fg-subtle)] transition-colors hover:bg-[var(--color-danger)]/10 hover:text-[var(--color-danger)]"
                  >
                    <TrashIcon width={15} height={15} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </>
  );
}
