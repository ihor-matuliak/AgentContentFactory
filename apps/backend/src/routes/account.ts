import { Router } from "express";
import { query } from "../db.js";
import { env } from "../env.js";
import type { SettingsResponse, UpdateSettingsRequest } from "@swarm/shared";

export const accountRouter = Router();

/** GET /api/account/settings — повернути поточну активну модель з БД */
accountRouter.get("/settings", async (req, res) => {
  try {
    const dbRes = await query<{ value: string }>(
      "SELECT value FROM system_settings WHERE key = 'active_model'"
    );
    const activeModel = (dbRes.rows[0]?.value ?? "claude-sonnet-4-6") as any;
    res.json({ activeModel } as SettingsResponse);
  } catch (err: any) {
    console.error("Помилка отримання налаштувань:", err);
    res.status(500).json({ error: "Не вдалося отримати налаштування акаунту" });
  }
});

/** POST /api/account/settings — оновити активну модель у БД (з валідацією) */
accountRouter.post("/settings", async (req, res) => {
  const { activeModel } = req.body as Partial<UpdateSettingsRequest>;

  if (!activeModel || (activeModel !== "claude-sonnet-4-6" && activeModel !== "gemini-3-1-flash-lite")) {
    res.status(400).json({ error: "Некоректна модель ШІ" });
    return;
  }

  // Якщо обрано Gemini, перевіримо наявність ключа в env
  if (activeModel === "gemini-3-1-flash-lite" && !env.geminiApiKey) {
    res.status(400).json({
      error: "Для використання моделі Gemini 3.1 Flash Lite необхідно налаштувати змінну GEMINI_API_KEY у файлі .env."
    });
    return;
  }

  try {
    await query(
      `INSERT INTO system_settings (key, value)
       VALUES ('active_model', $1)
       ON CONFLICT (key)
       DO UPDATE SET value = EXCLUDED.value`,
      [activeModel]
    );
    res.json({ success: true, activeModel } as any);
  } catch (err: any) {
    console.error("Помилка збереження налаштувань:", err);
    res.status(500).json({ error: "Не вдалося зберегти налаштування акаунту" });
  }
});
