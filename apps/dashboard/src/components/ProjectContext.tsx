"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import type { Project } from "@swarm/shared";
import { api } from "@/lib/api";

const ProjectCtx = createContext<Project | null>(null);

/** Поточний проєкт (гарантовано не null усередині провайдера). */
export function useProject(): Project {
  const ctx = useContext(ProjectCtx);
  if (!ctx) throw new Error("useProject використано поза ProjectProvider");
  return ctx;
}

/**
 * Завантажує проєкт за slug із URL і надає його дочірнім сторінкам.
 * Поки проєкт не завантажено — показуємо лоадер; на 404 — повідомлення.
 */
export function ProjectProvider({ children }: { children: ReactNode }) {
  const params = useParams<{ slug: string }>();
  const slug = params.slug;
  const [project, setProject] = useState<Project | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "missing">("loading");

  useEffect(() => {
    let alive = true;
    setState("loading");
    api
      .getProject(slug)
      .then((p) => {
        if (!alive) return;
        setProject(p);
        setState("ready");
      })
      .catch(() => alive && setState("missing"));
    return () => {
      alive = false;
    };
  }, [slug]);

  if (state === "loading") {
    return (
      <div className="grid min-h-dvh place-items-center">
        <div className="h-8 w-8 animate-pulse rounded-full bg-[var(--color-surface-2)]" />
      </div>
    );
  }

  if (state === "missing" || !project) {
    return (
      <div className="grid min-h-dvh place-items-center px-6 text-center">
        <div>
          <p className="text-[15px] text-[var(--color-fg-muted)]">
            Проєкт «{slug}» не знайдено.
          </p>
          <Link
            href="/"
            className="mt-3 inline-block text-[13px] text-[var(--color-honey)] hover:text-[var(--color-honey-bright)]"
          >
            ← До списку проєктів
          </Link>
        </div>
      </div>
    );
  }

  return <ProjectCtx.Provider value={project}>{children}</ProjectCtx.Provider>;
}
