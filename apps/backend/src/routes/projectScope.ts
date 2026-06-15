import type { Request } from "express";
import { getProjectById } from "../projects.js";

/**
 * Дістає й валідує projectId із запиту (Фаза 5).
 *
 * Шукає у query (?projectId=N) та в тілі (body.projectId). Повертає id лише
 * якщо такий проєкт існує; інакше null — роут має відповісти 400.
 */
export async function getProjectId(req: Request): Promise<number | null> {
  const raw =
    (req.query.projectId as unknown) ??
    (req.body as { projectId?: unknown } | undefined)?.projectId;
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) return null;
  const project = await getProjectById(id);
  return project ? id : null;
}
