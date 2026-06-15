import { Router } from "express";
import { getOverview, listScenarios, runBatch, seedScenarios } from "../tests.js";

export const testsRouter = Router();

/** GET /api/tests — зведення якості (пас-рейт, вартість, тривалість). Глобально. */
testsRouter.get("/", async (_req, res) => {
  res.json(await getOverview());
});

/** GET /api/tests/scenarios — список активних сценаріїв. */
testsRouter.get("/scenarios", async (_req, res) => {
  res.json(await listScenarios());
});

/** POST /api/tests/seed — завантажити базовий набір сценаріїв. */
testsRouter.post("/seed", async (_req, res) => {
  const n = await seedScenarios();
  res.json({ seeded: n });
});

/** POST /api/tests/batch — прогнати пакет сценаріїв (тіло: { limit }). */
testsRouter.post("/batch", async (req, res) => {
  const limit = Number((req.body as { limit?: unknown })?.limit);
  const results = await runBatch(Number.isInteger(limit) && limit > 0 ? limit : 30);
  res.json({ ran: results.length, results });
});
