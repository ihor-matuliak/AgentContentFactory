import { pool } from "../db.js";
import { ingestDir } from "../knowledge.js";
import { defaultProjectId, getProjectBySlug } from "../projects.js";

/**
 * CLI-інгест бази знань (Фаза 5).
 *
 * Використання:
 *   npm run knowledge:ingest -- --dir=/шлях/до/нотаток
 *   npm run knowledge:ingest -- --dir=./notes --project=ai-proryv
 *
 * Без --project індексуємо у перший (демо) проєкт.
 */
function arg(name: string): string | undefined {
  const pref = `--${name}=`;
  const found = process.argv.find((a) => a.startsWith(pref));
  return found ? found.slice(pref.length) : undefined;
}

async function main(): Promise<void> {
  const dir = arg("dir");
  if (!dir) {
    console.error("❌ Вкажіть теку: --dir=/шлях/до/матеріалів");
    process.exit(1);
  }
  const projectSlug = arg("project");
  let projectId: number | null;
  if (projectSlug) {
    const project = await getProjectBySlug(projectSlug);
    if (!project) {
      console.error(`❌ Проєкт «${projectSlug}» не знайдено.`);
      process.exit(1);
    }
    projectId = project.id;
  } else {
    projectId = await defaultProjectId();
  }
  if (!projectId) {
    console.error("❌ Немає жодного проєкту. Створіть проєкт у дашборді.");
    process.exit(1);
  }

  console.log(`==> Інгест теки «${dir}» у проєкт #${projectId}…`);
  const result = await ingestDir({ projectId, dir });
  console.log(`✅ Проіндексовано джерел: ${result.sources}, чанків: ${result.chunks}.`);
}

main()
  .catch((err) => {
    console.error("Помилка інгесту:", err);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
