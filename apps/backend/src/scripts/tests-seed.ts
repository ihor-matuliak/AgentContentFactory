import { pool } from "../db.js";
import { seedScenarios } from "../tests.js";

/**
 * Завантажує базовий набір тестових сценаріїв (Фаза 5).
 * Використання: npm run tests:seed
 */
seedScenarios()
  .then((n) => console.log(`✅ Завантажено/оновлено ${n} тестових сценаріїв.`))
  .catch((err) => {
    console.error("Помилка tests:seed:", err);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
