import cors from "cors";
import express from "express";
import type { HealthResponse } from "@swarm/shared";
import { env, hasClaudeCredentials } from "./env.js";
import { agentsRouter } from "./routes/agents.js";
import { runsRouter } from "./routes/runs.js";
import { eventsRouter } from "./routes/events.js";
import { profileRouter } from "./routes/profile.js";
import { contentRouter } from "./routes/content.js";
import { authEnabled, authRouter, requireAuth } from "./routes/auth.js";
import { resumeQueue } from "./agents/queue.js";

const app = express();

app.use(cors({ allowedHeaders: ["Content-Type", "x-swarm-password"] }));
app.use(express.json({ limit: "2mb" }));

/** GET /api/health — перевірка стану бекенду (публічно). */
app.get("/api/health", (_req, res) => {
  const body: HealthResponse = {
    status: "ok",
    service: "@swarm/backend",
    time: new Date().toISOString(),
  };
  res.json(body);
});

// Авторизація (публічні маршрути), далі захист решти API паролем (якщо заданий).
app.use("/api/auth", authRouter);
app.use("/api", requireAuth);

app.use("/api/agents", agentsRouter);
app.use("/api/runs", runsRouter);
app.use("/api/events", eventsRouter);
app.use("/api/profile", profileRouter);
app.use("/api/content", contentRouter);

app.listen(env.backendPort, () => {
  console.log(`🚀 Бекенд рою слухає на http://localhost:${env.backendPort}`);
  console.log(`   Health: http://localhost:${env.backendPort}/api/health`);
  if (!hasClaudeCredentials) {
    console.warn(
      "⚠️  Доступ до Claude не налаштовано — додайте CLAUDE_CODE_OAUTH_TOKEN або ANTHROPIC_API_KEY у .env",
    );
  } else {
    console.log(`   Модель Claude: ${env.anthropicModel}`);
  }
  console.log(
    authEnabled()
      ? "   🔒 Дашборд захищено паролем (SWARM_PASSWORD)."
      : "   🔓 Дашборд без пароля (SWARM_PASSWORD порожній).",
  );
  // Підхоплюємо незавершені прогони після перезапуску бекенду.
  void resumeQueue();
});
