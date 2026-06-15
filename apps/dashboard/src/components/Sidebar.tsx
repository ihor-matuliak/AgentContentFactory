"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ComponentType, type SVGProps } from "react";
import { api } from "@/lib/api";
import {
  AnalyticsIcon,
  CalendarIcon,
  ChatIcon,
  HexLogo,
  OverviewIcon,
  ProfileIcon,
  ReviewIcon,
  RunsIcon,
  SettingsIcon,
  TasksIcon,
} from "@/components/icons";

type NavItem = {
  label: string;
  href: string;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  /** Розділ ще не реалізовано — показуємо як «скоро» без переходу. */
  soon?: boolean;
  /** Показувати лічильник непрочитаних сповіщень. */
  badge?: boolean;
};

const NAV: NavItem[] = [
  { label: "Огляд", href: "/", icon: OverviewIcon },
  { label: "Чати з агентами", href: "/chats", icon: ChatIcon },
  { label: "Прогони рою", href: "/runs", icon: RunsIcon },
  { label: "Задачі", href: "/tasks", icon: TasksIcon },
  { label: "Календар", href: "/calendar", icon: CalendarIcon },
  { label: "На перевірці", href: "/review", icon: ReviewIcon, badge: true },
  { label: "Профіль", href: "/profile", icon: ProfileIcon },
  { label: "Аналітика", href: "/analytics", icon: AnalyticsIcon, soon: true },
  { label: "Налаштування", href: "/settings", icon: SettingsIcon, soon: true },
];

export function Sidebar() {
  const pathname = usePathname();
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    let alive = true;
    const tick = () =>
      api
        .unreadCount()
        .then((r) => alive && setUnread(r.unread))
        .catch(() => {});
    void tick();
    const t = setInterval(tick, 8000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [pathname]);

  return (
    <aside className="sticky top-0 z-10 flex h-dvh w-[256px] shrink-0 flex-col border-r border-[var(--color-border)] bg-[var(--color-base)]/80 backdrop-blur">
      {/* Бренд */}
      <div className="flex items-center gap-3 px-5 py-5">
        <span className="grid h-10 w-10 place-items-center rounded-xl bg-[var(--color-honey)]/12 text-[var(--color-honey)] ring-1 ring-[var(--color-honey)]/25">
          <HexLogo />
        </span>
        <div className="leading-tight">
          <div className="font-display text-[15px] font-semibold tracking-tight">
            AI&nbsp;ПРОРИВ
          </div>
          <div className="text-[11px] uppercase tracking-[0.18em] text-[var(--color-fg-subtle)]">
            Фабрика контенту
          </div>
        </div>
      </div>

      {/* Навігація */}
      <nav className="flex-1 space-y-1 px-3 py-2">
        {NAV.map((item) => {
          const active =
            item.href === "/"
              ? pathname === "/"
              : pathname.startsWith(item.href);
          const Glyph = item.icon;

          if (item.soon) {
            return (
              <div
                key={item.href}
                className="group flex cursor-not-allowed items-center gap-3 rounded-xl px-3 py-2.5 text-[14px] text-[var(--color-fg-subtle)]"
                title="Розділ зʼявиться в наступних фазах"
              >
                <Glyph className="opacity-60" />
                <span className="flex-1">{item.label}</span>
                <span className="rounded-md bg-[var(--color-surface-2)] px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-[var(--color-fg-subtle)]">
                  скоро
                </span>
              </div>
            );
          }

          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={[
                "group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-[14px] transition-colors",
                active
                  ? "bg-[var(--color-honey)]/10 text-[var(--color-fg)]"
                  : "text-[var(--color-fg-muted)] hover:bg-[var(--color-surface)] hover:text-[var(--color-fg)]",
              ].join(" ")}
            >
              {active && (
                <span className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-full bg-[var(--color-honey)]" />
              )}
              <Glyph
                className={
                  active ? "text-[var(--color-honey)]" : "text-current"
                }
              />
              <span className="flex-1">{item.label}</span>
              {item.badge && unread > 0 && (
                <span className="grid h-5 min-w-5 place-items-center rounded-full bg-[var(--color-honey)] px-1.5 font-mono text-[11px] font-semibold text-[var(--color-ink)]">
                  {unread}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      {/* Підвал — статус рою */}
      <div className="border-t border-[var(--color-border)] px-5 py-4">
        <div className="flex items-center gap-2.5">
          <span className="relative flex h-2.5 w-2.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[var(--color-online)] opacity-60" />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-[var(--color-online)]" />
          </span>
          <span className="text-[13px] text-[var(--color-fg-muted)]">
            Рій на звʼязку
          </span>
        </div>
      </div>
    </aside>
  );
}
