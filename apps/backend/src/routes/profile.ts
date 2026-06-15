import { Router } from "express";
import type { SaveProfileRequest } from "@swarm/shared";
import { getProfile, saveProfile } from "../profile.js";

export const profileRouter = Router();

/** GET /api/profile — поточний бренд-контекст проєкту. */
profileRouter.get("/", async (_req, res) => {
  res.json(await getProfile());
});

/** PUT /api/profile — зберегти бренд-контекст. */
profileRouter.put("/", async (req, res) => {
  const b = req.body as Partial<SaveProfileRequest>;
  const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  const saved = await saveProfile({
    business: str(b.business),
    audience: str(b.audience),
    products: str(b.products),
    tone: str(b.tone),
    taboos: str(b.taboos),
    examples: str(b.examples),
  });
  res.json(saved);
});
