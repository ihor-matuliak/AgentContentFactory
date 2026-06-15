"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ComponentType, type SVGProps } from "react";
import { api } from "@/lib/api";
import { useProject } from "@/components/ProjectContext";
import {
  CalendarIcon,
  ChatIcon,
  KnowledgeIcon,
  OverviewIcon,
  ProfileIcon,
  ReviewIcon,
  RunsIcon,
  TasksIcon,
  TestIcon,
} from "@/components/icons";

type NavItem = {
  label: string;
  seg: string;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  badge?: boolean;
};

const NAV: NavItem[] = [
  { label: "Огляд", seg: "", icon: OverviewIcon },
  { label: "Прогони", seg: "runs", icon: RunsIcon },
  { label: "На перевірці", seg: "review", icon: ReviewIcon, badge: true },
  { label: "Календар", seg: "calendar", icon: CalendarIcon },
  { label: "Завдання", seg: "tasks", icon: TasksIcon },
  { label: "Чати", seg: "chats", icon: ChatIcon },
  { label: "Профіль", seg: "profile", icon: ProfileIcon },
  { label: "Знання", seg: "knowledge", icon: KnowledgeIcon },
  { label: "Тести", seg: "tests", icon: TestIcon },
];

export function ProjectSidebar() {
  const project = useProject();
  const pathname = usePathname();
  const [unread, setUnread] = useState(0);
  const base = `/projects/${project.slug}`;

  useEffect(() => {
    let alive = true;
    const tick = () =>
      api
        .unreadCount(project.id)
        .then((r) => alive && setUnread(r.unread))
        .catch(() => {});
    void tick();
    const t = setInterval(tick, 8000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [project.id, pathname]);

  return (
    <aside className="sticky top-14 z-10 flex h-[calc(100dvh-3.5rem)] w-[230px] shrink-0 flex-col border-r border-[var(--color-border)] bg-[var(--color-base)]/80 backdrop-blur">
      {/* Шапка проєкту */}
      <div className="border-b border-[var(--color-border)] px-4 py-4">
        <div className="text-[10px] uppercase tracking-[0.18em] text-[var(--color-fg-subtle)]">
          Проєкт
        </div>
        <div className="mt-1 flex items-center justify-between gap-2">
          <span className="truncate font-display text-[15px] font-semibold">
            {project.name}
          </span>
          <Link
            href="/"
            title="До всіх проєктів"
            className="shrink-0 rounded-md px-1.5 py-0.5 text-[11px] text-[var(--color-honey)] hover:bg-[var(--color-surface)]"
          >
            ↺
          </Link>
        </div>
      </div>

      {/* Навігація проєкту */}
      <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-3">
        {NAV.map((item) => {
          const href = item.seg ? `${base}/${item.seg}` : base;
          const active =
            item.seg === ""
              ? pathname === base
              : pathname === href || pathname.startsWith(`${href}/`);
          const Glyph = item.icon;
          return (
            <Link
              key={item.seg || "overview"}
              href={href}
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
              <Glyph className={active ? "text-[var(--color-honey)]" : "text-current"} />
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

      <div className="border-t border-[var(--color-border)] px-4 py-3">
        <div className="flex items-center gap-2.5">
          <span className="relative flex h-2.5 w-2.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[var(--color-online)] opacity-60" />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-[var(--color-online)]" />
          </span>
          <span className="text-[12.5px] text-[var(--color-fg-muted)]">Рій на звʼязку</span>
        </div>
      </div>
    </aside>
  );
}
