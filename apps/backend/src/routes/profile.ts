import { Router } from "express";
import type { SaveProfileRequest } from "@swarm/shared";
import { getProfile, saveProfile } from "../profile.js";
import { getProjectId } from "./projectScope.js";

export const profileRouter = Router();

/** GET /api/profile?projectId=N — бренд-контекст проєкту. */
profileRouter.get("/", async (req, res) => {
  const projectId = await getProjectId(req);
  if (projectId === null) {
    res.status(400).json({ error: "Потрібен валідний projectId" });
    return;
  }
  res.json(await getProfile(projectId));
});

/** PUT /api/profile?projectId=N — зберегти бренд-контекст проєкту. */
profileRouter.put("/", async (req, res) => {
  const projectId = await getProjectId(req);
  if (projectId === null) {
    res.status(400).json({ error: "Потрібен валідний projectId" });
    return;
  }
  const b = req.body as Partial<SaveProfileRequest>;
  const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  const saved = await saveProfile(projectId, {
    business: str(b.business),
    audience: str(b.audience),
    products: str(b.products),
    tone: str(b.tone),
    taboos: str(b.taboos),
    examples: str(b.examples),
    telegramChannel: str(b.telegramChannel),
  });
  res.json(saved);
});
