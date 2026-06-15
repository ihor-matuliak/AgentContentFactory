"use client";

import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { api } from "@/lib/api";
import { HexLogo, LockIcon } from "@/components/icons";

type Gate = "loading" | "open" | "locked";

/**
 * Захист дашборда паролем (Фаза 4).
 *
 * Якщо бекенд повідомляє, що пароль не потрібен (SWARM_PASSWORD порожній) —
 * пропускає одразу. Інакше показує форму входу й зберігає пароль локально.
 * Якщо бекенд недоступний — пропускає, щоб сторінки показали власні стани.
 */
export function AuthGate({ children }: { children: ReactNode }) {
  const [gate, setGate] = useState<Gate>("loading");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const { required } = await api.authStatus();
        if (!alive) return;
        if (!required) {
          setGate("open");
          return;
        }
        // Пароль потрібен — перевіряємо збережений запитом до захищеного API.
        if (api.hasPassword()) {
          try {
            await api.listProjects();
            if (alive) setGate("open");
            return;
          } catch {
            api.setPassword("");
          }
        }
        if (alive) setGate("locked");
      } catch {
        // Бекенд недоступний — не блокуємо інтерфейс.
        if (alive) setGate("open");
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy || !password.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await api.login(password);
      api.setPassword(password);
      setGate("open");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Невірний пароль");
    } finally {
      setBusy(false);
    }
  }

  if (gate === "open") return <>{children}</>;

  if (gate === "loading") {
    return (
      <div className="grid min-h-dvh place-items-center">
        <div className="h-8 w-8 animate-pulse rounded-full bg-[var(--color-surface-2)]" />
      </div>
    );
  }

  return (
    <div className="grid min-h-dvh place-items-center px-6">
      <form
        onSubmit={submit}
        className="w-full max-w-sm rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-surface)] p-7"
      >
        <div className="flex items-center gap-3">
          <span className="grid h-11 w-11 place-items-center rounded-xl bg-[var(--color-honey)]/12 text-[var(--color-honey)] ring-1 ring-[var(--color-honey)]/25">
            <HexLogo />
          </span>
          <div>
            <div className="font-display text-[16px] font-semibold">AI&nbsp;ПРОРИВ</div>
            <div className="text-[11px] uppercase tracking-[0.18em] text-[var(--color-fg-subtle)]">
              Командний центр
            </div>
          </div>
        </div>

        <h1 className="mt-6 flex items-center gap-2 font-display text-[18px] font-semibold">
          <LockIcon width={18} height={18} className="text-[var(--color-honey)]" />
          Вхід до дашборда
        </h1>
        <p className="mt-1 text-[13px] text-[var(--color-fg-muted)]">
          Дашборд захищено паролем. Введи його, щоб продовжити.
        </p>

        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoFocus
          placeholder="Пароль"
          className="mt-5 w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-base)] px-4 py-3 text-[14px] text-[var(--color-fg)] placeholder:text-[var(--color-fg-subtle)] focus:border-[var(--color-honey)]/50 focus:outline-none"
        />
        {error && <p className="mt-2 text-[13px] text-[var(--color-danger)]">{error}</p>}
        <button
          type="submit"
          disabled={busy || !password.trim()}
          className="mt-4 w-full rounded-xl bg-[var(--color-honey)] px-5 py-2.5 text-[14px] font-semibold text-[var(--color-ink)] transition-colors hover:bg-[var(--color-honey-bright)] disabled:cursor-not-allowed disabled:bg-[var(--color-surface-2)] disabled:text-[var(--color-fg-subtle)]"
        >
          {busy ? "Перевіряю…" : "Увійти"}
        </button>
      </form>
    </div>
  );
}
