"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { HexLogo } from "@/components/icons";
import { AccountIcon, IdeaIcon, ProjectsIcon } from "@/components/icons";
import type { ComponentType, SVGProps } from "react";

type Tab = {
  label: string;
  href: string;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  match: (path: string) => boolean;
};

const TABS: Tab[] = [
  {
    label: "Проєкти",
    href: "/",
    icon: ProjectsIcon,
    match: (p) => p === "/" || p.startsWith("/projects"),
  },
  { label: "Інбокс ідей", href: "/ideas", icon: IdeaIcon, match: (p) => p.startsWith("/ideas") },
  { label: "Акаунт", href: "/account", icon: AccountIcon, match: (p) => p.startsWith("/account") },
];

/** Верхня навігація платформи: Проєкти · Інбокс ідей · Акаунт. */
export function TopNav() {
  const pathname = usePathname();
  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-6 border-b border-[var(--color-border)] bg-[var(--color-base)]/85 px-5 backdrop-blur md:px-7">
      <Link href="/" className="flex items-center gap-2.5">
        <span className="grid h-8 w-8 place-items-center rounded-lg bg-[var(--color-honey)]/12 text-[var(--color-honey)] ring-1 ring-[var(--color-honey)]/25">
          <HexLogo width={18} height={18} />
        </span>
        <span className="font-display text-[14px] font-semibold tracking-tight">
          Agent&nbsp;Content&nbsp;Factory
        </span>
      </Link>

      <nav className="flex items-center gap-1">
        {TABS.map((tab) => {
          const active = tab.match(pathname);
          const Glyph = tab.icon;
          return (
            <Link
              key={tab.href}
              href={tab.href}
              aria-current={active ? "page" : undefined}
              className={[
                "flex items-center gap-2 rounded-lg px-3 py-1.5 text-[13.5px] transition-colors",
                active
                  ? "bg-[var(--color-honey)]/10 text-[var(--color-fg)]"
                  : "text-[var(--color-fg-muted)] hover:bg-[var(--color-surface)] hover:text-[var(--color-fg)]",
              ].join(" ")}
            >
              <Glyph width={16} height={16} className={active ? "text-[var(--color-honey)]" : "text-current"} />
              {tab.label}
            </Link>
          );
        })}
      </nav>
    </header>
  );
}
