import { Router } from "express";
import { publishPlanItemToTelegram } from "../telegram.js";

/** Публікація контенту в зовнішні майданчики (Фаза 5). */
export const publishRouter = Router();

/** POST /api/content-plan/:id/publish/telegram — опублікувати запис у Telegram-канал. */
publishRouter.post("/:id/publish/telegram", async (req, res) => {
  const result = await publishPlanItemToTelegram(Number(req.params.id));
  if (!result.ok) {
    res.status(400).json({ error: result.error });
    return;
  }
  res.json({ ok: true });
});
