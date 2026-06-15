import { pool } from "../db.js";
import { listScenarios, runBatch, seedScenarios } from "../tests.js";

/**
 * Проганяє пакет тестових сценаріїв через агентів + Критика (Фаза 5).
 * Використання: npm run tests:batch -- --limit=30
 */
function arg(name: string): string | undefined {
  const pref = `--${name}=`;
  const found = process.argv.find((a) => a.startsWith(pref));
  return found ? found.slice(pref.length) : undefined;
}

async function main(): Promise<void> {
  const limit = Number(arg("limit") ?? 30);

  // Якщо сценаріїв ще немає — завантажуємо базовий набір.
  let scenarios = await listScenarios();
  if (scenarios.length === 0) {
    console.log("ℹ️  Сценаріїв не знайдено — завантажую базовий набір…");
    await seedScenarios();
    scenarios = await listScenarios();
  }

  console.log(`==> Прогін до ${Math.min(limit, scenarios.length)} сценаріїв…`);
  const results = await runBatch(Number.isFinite(limit) && limit > 0 ? limit : 30);

  const passed = results.filter((r) => r.verdict === "pass").length;
  const cost = results.reduce((s, r) => s + r.costUsd, 0);
  console.log(
    `✅ Прогнано ${results.length} тестів · pass ${passed}/${results.length} · вартість $${cost.toFixed(4)}`,
  );
  for (const r of results) {
    const mark = r.verdict === "pass" ? "✓" : "✗";
    console.log(`  ${mark} [${r.agentSlug}] ${r.scenarioTitle ?? r.scenarioId} — ${r.comment.slice(0, 80)}`);
  }
}

main()
  .catch((err) => {
    console.error("Помилка tests:batch:", err);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
