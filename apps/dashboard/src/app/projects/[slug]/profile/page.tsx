"use client";

import { useEffect, useState, type FormEvent } from "react";
import type { SaveProfileRequest } from "@swarm/shared";
import { api } from "@/lib/api";
import { useProject } from "@/components/ProjectContext";
import { PageHeader } from "@/components/ui";
import { CheckIcon, ProfileIcon } from "@/components/icons";

const EMPTY: SaveProfileRequest = {
  business: "",
  audience: "",
  products: "",
  tone: "",
  taboos: "",
  examples: "",
  telegramChannel: "",
};

type Field = {
  key: keyof SaveProfileRequest;
  label: string;
  hint: string;
  placeholder: string;
  rows: number;
};

const FIELDS: Field[] = [
  { key: "business", label: "Бізнес", hint: "Чим займається проєкт — одним-двома реченнями.", placeholder: "Напр.: застосунок для бігу з планами тренувань і спільнотою.", rows: 2 },
  { key: "audience", label: "Аудиторія", hint: "Для кого робимо контент.", placeholder: "Напр.: бігуни-аматори 25–40, які готуються до першого марафону.", rows: 2 },
  { key: "products", label: "Продукти / послуги", hint: "Що саме просуваємо.", placeholder: "Напр.: підписка Pro, персональні плани, бігові челенджі.", rows: 2 },
  { key: "tone", label: "Тон і голос бренду", hint: "Як звучимо: дружньо, експертно, з гумором…", placeholder: "Напр.: підбадьорливо, по-простому, без канцеляриту, на «ти».", rows: 2 },
  { key: "taboos", label: "Табу", hint: "Чого уникати в контенті.", placeholder: "Напр.: жодних обіцянок схуднення, без агресії та клікбейту.", rows: 2 },
  { key: "examples", label: "Приклади вдалого контенту", hint: "Формулювання чи пости, що задають планку.", placeholder: "Напр.: «5 км без зупинки — реально за 6 тижнів. Ось як…»", rows: 3 },
  { key: "telegramChannel", label: "Telegram-канал (chat_id)", hint: "Куди публікувати з Календаря. chat_id каналу (напр. @my_channel або -100…).", placeholder: "@my_channel", rows: 1 },
];

export default function ProfilePage() {
  const project = useProject();
  const [form, setForm] = useState<SaveProfileRequest>(EMPTY);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setLoaded(false);
    api
      .getProfile(project.id)
      .then((p) => {
        if (!alive) return;
        const { updatedAt: u, ...rest } = p;
        setForm(rest);
        setUpdatedAt(u);
      })
      .catch((e) => alive && setError(e instanceof Error ? e.message : "Помилка"))
      .finally(() => alive && setLoaded(true));
    return () => {
      alive = false;
    };
  }, [project.id]);

  function set(key: keyof SaveProfileRequest, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
    setSaved(false);
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    if (saving) return;
    setSaving(true);
    setError(null);
    try {
      const p = await api.saveProfile(project.id, form);
      setUpdatedAt(p.updatedAt);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не вдалося зберегти");
    } finally {
      setSaving(false);
    }
  }

  const filled = FIELDS.filter((f) => (form[f.key] ?? "").trim().length > 0).length;

  return (
    <>
      <PageHeader
        title="Профіль проєкту"
        subtitle="Бренд-контекст цього проєкту. Він автоматично домішується до характеру кожного агента (разом із релевантними знаннями) — щоб увесь контент звучав в одному голосі."
        right={
          <div className="flex items-center gap-2 rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] px-3.5 py-2 text-[12px] text-[var(--color-fg-muted)]">
            <ProfileIcon width={15} height={15} className="text-[var(--color-honey)]" />
            <span className="font-mono tabular">{filled}/{FIELDS.length}</span> заповнено
          </div>
        }
      />

      <form onSubmit={save} className="mx-auto max-w-3xl space-y-5 px-6 py-7 md:px-10">
        {error && (
          <div className="rounded-xl border border-[var(--color-danger)]/30 bg-[var(--color-danger)]/10 px-4 py-3 text-[13px] text-[var(--color-danger)]">{error}</div>
        )}

        {!loaded
          ? [0, 1, 2].map((i) => (
              <div key={i} className="h-28 animate-pulse rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-surface)]" />
            ))
          : FIELDS.map((f) => (
              <div key={f.key} className="rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
                <label className="block text-[14px] font-semibold text-[var(--color-fg)]">{f.label}</label>
                <p className="mb-2.5 mt-0.5 text-[12.5px] text-[var(--color-fg-subtle)]">{f.hint}</p>
                <textarea
                  value={form[f.key] ?? ""}
                  onChange={(e) => set(f.key, e.target.value)}
                  rows={f.rows}
                  placeholder={f.placeholder}
                  className="w-full resize-none rounded-xl border border-[var(--color-border)] bg-[var(--color-base)] px-4 py-3 text-[14px] leading-relaxed text-[var(--color-fg)] placeholder:text-[var(--color-fg-subtle)] focus:border-[var(--color-honey)]/50 focus:outline-none"
                />
              </div>
            ))}

        {loaded && (
          <div className="sticky bottom-0 -mx-6 flex items-center justify-between gap-4 border-t border-[var(--color-border)] bg-[var(--color-ink)]/85 px-6 py-4 backdrop-blur md:-mx-10 md:px-10">
            <span className="text-[12px] text-[var(--color-fg-subtle)]">
              {updatedAt ? `Оновлено ${new Date(updatedAt).toLocaleString("uk-UA")}` : "Ще не збережено"}
            </span>
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-2 rounded-xl bg-[var(--color-honey)] px-5 py-2.5 text-[14px] font-semibold text-[var(--color-ink)] transition-colors hover:bg-[var(--color-honey-bright)] disabled:opacity-60"
            >
              {saved ? <CheckIcon width={16} height={16} /> : null}
              {saving ? "Зберігаю…" : saved ? "Збережено" : "Зберегти профіль"}
            </button>
          </div>
        )}
      </form>
    </>
  );
}
