import type { ReactNode } from "react";
import { ProjectProvider } from "@/components/ProjectContext";
import { ProjectSidebar } from "@/components/ProjectSidebar";

/** Каркас сторінок усередині проєкту: бічне меню + контент. */
export default function ProjectLayout({ children }: { children: ReactNode }) {
  return (
    <ProjectProvider>
      <div className="flex">
        <ProjectSidebar />
        <main className="min-w-0 flex-1">{children}</main>
      </div>
    </ProjectProvider>
  );
}
