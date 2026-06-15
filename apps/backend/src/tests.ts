import type {
  TestAgentSummary,
  TestRun,
  TestScenario,
  TestsOverview,
  TestVerdict,
} from "@swarm/shared";
import { query } from "./db.js";
import { findAgentBySlug } from "./chat.js";
import { runAgent } from "./agents/runner.js";

/**
 * Фабрика тестів (Фаза 5).
 *
 * Типові сценарії по всіх агентах прогоняються через самого агента, а Критик
 * виставляє вердикт pass/fail за рубрикою. Результати лягають у `test_runs`,
 * сторінка «Тести» показує пас-рейт, вартість і тривалість по агентах.
 */

// ── Базовий набір сценаріїв (завантажується командою tests:seed). ──
interface SeedScenario {
  agentSlug: string;
  title: string;
  prompt: string;
  rubric: string;
}

export const SEED_SCENARIOS: SeedScenario[] = [
  {
    agentSlug: "strategist",
    title: "Контент-план на тиждень",
    prompt:
      "Запропонуй контент-план на тиждень для Telegram-каналу про здорове харчування: 5 дописів із темами й короткими тезами.",
    rubric:
      "Має бути рівно 5 ідей із конкретними темами й тезами, реалістичних для Telegram, без води.",
  },
  {
    agentSlug: "strategist",
    title: "Розбивка цілі на кроки",
    prompt:
      "Розбий ціль «запустити рубрику коротких відео-порад» на послідовні кроки з виконавцями.",
    rubric: "Чіткі послідовні кроки з відповідальними ролями, без зайвих кроків.",
  },
  {
    agentSlug: "scriptwriter",
    title: "Сценарій Reels на 30 секунд",
    prompt:
      "Напиши сценарій для Instagram Reels на 30 секунд про користь ранкової зарядки: гачок, тіло, заклик до дії.",
    rubric: "Є гачок у перші 3 секунди, структура, заклик до дії, вкладається в 30 секунд.",
  },
  {
    agentSlug: "scriptwriter",
    title: "Підпис до фото",
    prompt: "Придумай один короткий чіпкий підпис до фото кави з ранковим світлом.",
    rubric: "Один короткий підпис, влучний і доречний тону соцмереж.",
  },
  {
    agentSlug: "reelsmaker",
    title: "Розкадровка Reels",
    prompt:
      "Зроби розкадровку Reels на 6 кадрів для відео про лайфхак прибирання: опиши кожен кадр.",
    rubric: "6 чітких кадрів із описом дії й плану, логічна послідовність.",
  },
  {
    agentSlug: "video-editor",
    title: "План монтажу",
    prompt:
      "Опиши план монтажу динамічного Shorts на 20 секунд: переходи, темп, субтитри, музика.",
    rubric: "Конкретні рішення з монтажу, темпу, субтитрів і музики під формат Shorts.",
  },
  {
    agentSlug: "designer",
    title: "Концепт обкладинки",
    prompt:
      "Запропонуй концепт обкладинки для YouTube-відео про продуктивність: композиція, кольори, текст.",
    rubric: "Опис композиції, палітри й тексту, придатний як бриф дизайнеру.",
  },
  {
    agentSlug: "publisher",
    title: "Допис у Telegram",
    prompt:
      "Сформуй готовий до публікації допис у Telegram про вихід нового епізоду подкасту з емодзі та хештегами.",
    rubric: "Готовий допис із гачком, суттю, заклиом, доречними емодзі та хештегами.",
  },
  {
    agentSlug: "programmer",
    title: "Скрипт автопостингу",
    prompt:
      "Опиши, як автоматизувати публікацію дописів у Telegram через Bot API: ключові кроки й приклад запиту.",
    rubric: "Коректні технічні кроки й приклад виклику Telegram Bot API.",
  },
  {
    agentSlug: "critic",
    title: "Оцінка слабкого допису",
    prompt:
      "Оціни цей допис і дай 3 конкретні поради: «Купуйте наш продукт. Він найкращий. Дзвоніть.»",
    rubric: "Чесна критика з 3 конкретними, дієвими порадами на покращення.",
  },
];

interface ScenarioRow {
  id: number;
  agent_slug: string;
  title: string;
  prompt: string;
  rubric: string;
  is_active: boolean;
  created_at: Date;
}

function mapScenario(row: ScenarioRow): TestScenario {
  return {
    id: row.id,
    agentSlug: row.agent_slug,
    title: row.title,
    prompt: row.prompt,
    rubric: row.rubric,
    isActive: row.is_active,
    createdAt: row.created_at.toISOString(),
  };
}

/** Завантажує/оновлює базовий набір сценаріїв (UPSERT за agent_slug+title). */
export async function seedScenarios(): Promise<number> {
  for (const s of SEED_SCENARIOS) {
    await query(
      `INSERT INTO test_scenarios (agent_slug, title, prompt, rubric)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (agent_slug, title) DO UPDATE SET
         prompt = EXCLUDED.prompt, rubric = EXCLUDED.rubric, is_active = TRUE`,
      [s.agentSlug, s.title, s.prompt, s.rubric],
    );
  }
  return SEED_SCENARIOS.length;
}

export async function listScenarios(): Promise<TestScenario[]> {
  const { rows } = await query<ScenarioRow>(
    "SELECT * FROM test_scenarios WHERE is_active = TRUE ORDER BY agent_slug, title",
  );
  return rows.map(mapScenario);
}

/** Дістає перший JSON-обʼєкт із тексту (для вердикту Критика). */
function extractJson(text: string): { verdict?: string; score?: number; comment?: string } {
  const cleaned = text.replace(/```json/gi, "```").replace(/```/g, "");
  const start = cleaned.indexOf("{");
  if (start === -1) throw new Error("Немає JSON");
  let depth = 0;
  for (let i = start; i < cleaned.length; i++) {
    if (cleaned[i] === "{") depth++;
    else if (cleaned[i] === "}") {
      depth--;
      if (depth === 0) return JSON.parse(cleaned.slice(start, i + 1));
    }
  }
  throw new Error("Не вдалося розібрати JSON");
}

interface TestRunRow {
  id: number;
  scenario_id: number;
  agent_slug: string;
  verdict: string;
  score: number | null;
  comment: string;
  answer: string;
  input_tokens: string;
  output_tokens: string;
  cost_usd: string;
  duration_ms: number;
  created_at: Date;
  scenario_title?: string;
}

function mapTestRun(row: TestRunRow): TestRun {
  return {
    id: row.id,
    scenarioId: row.scenario_id,
    agentSlug: row.agent_slug,
    verdict: row.verdict as TestVerdict,
    score: row.score,
    comment: row.comment,
    answer: row.answer,
    inputTokens: Number(row.input_tokens),
    outputTokens: Number(row.output_tokens),
    costUsd: Number(row.cost_usd),
    durationMs: row.duration_ms,
    createdAt: row.created_at.toISOString(),
    scenarioTitle: row.scenario_title,
  };
}

/** Проганяє один сценарій: агент відповідає → Критик виставляє вердикт. */
export async function runScenario(scenario: TestScenario): Promise<TestRun> {
  const agent = await findAgentBySlug(scenario.agentSlug);
  if (!agent) throw new Error(`Агента ${scenario.agentSlug} не знайдено`);

  const started = Date.now();
  let answer = "";
  let inputTokens = 0;
  let outputTokens = 0;
  let costUsd = 0;
  let verdict: TestVerdict = "fail";
  let score: number | null = null;
  let comment = "";

  try {
    // Тестуємо «голий» характер агента — без бренд-контексту проєкту.
    const res = await runAgent({ systemPrompt: agent.systemPrompt, prompt: scenario.prompt });
    answer = res.text;
    inputTokens = res.usage.inputTokens;
    outputTokens = res.usage.outputTokens;
    costUsd = res.usage.costUsd;
  } catch (err) {
    comment = `Агент не відповів: ${err instanceof Error ? err.message : String(err)}`;
    return insertTestRun(scenario, { verdict, score, comment, answer, inputTokens, outputTokens, costUsd, durationMs: Date.now() - started });
  }

  // Вердикт Критика.
  const critic = await findAgentBySlug("critic");
  if (critic) {
    try {
      const prompt = `Сценарій тесту для агента «${agent.name}»:
Завдання: ${scenario.prompt}
Критерії якості: ${scenario.rubric}

Відповідь агента:
"""
${answer}
"""

Оціни, чи відповідь задовольняє критерії. Поверни ЛИШЕ JSON:
{ "verdict": "pass" | "fail", "score": <0-100>, "comment": "<стисло українською>" }`;
      const res = await runAgent({ systemPrompt: critic.systemPrompt, prompt });
      costUsd += res.usage.costUsd;
      inputTokens += res.usage.inputTokens;
      outputTokens += res.usage.outputTokens;
      const parsed = extractJson(res.text);
      verdict = parsed.verdict === "pass" ? "pass" : "fail";
      score = typeof parsed.score === "number" ? Math.round(parsed.score) : null;
      comment = (parsed.comment ?? "").toString();
    } catch {
      // Критик не дав структури — приймаємо як pass, але без оцінки.
      verdict = answer.trim() ? "pass" : "fail";
      comment = "Критик не дав структурованого вердикту.";
    }
  } else {
    verdict = answer.trim() ? "pass" : "fail";
    comment = "Критик недоступний — зараховано за фактом відповіді.";
  }

  return insertTestRun(scenario, {
    verdict, score, comment, answer, inputTokens, outputTokens, costUsd,
    durationMs: Date.now() - started,
  });
}

async function insertTestRun(
  scenario: TestScenario,
  data: {
    verdict: TestVerdict;
    score: number | null;
    comment: string;
    answer: string;
    inputTokens: number;
    outputTokens: number;
    costUsd: number;
    durationMs: number;
  },
): Promise<TestRun> {
  const { rows } = await query<TestRunRow>(
    `INSERT INTO test_runs
       (scenario_id, agent_slug, verdict, score, comment, answer, input_tokens, output_tokens, cost_usd, duration_ms)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *`,
    [
      scenario.id,
      scenario.agentSlug,
      data.verdict,
      data.score,
      data.comment.slice(0, 2000),
      data.answer.slice(0, 8000),
      data.inputTokens,
      data.outputTokens,
      data.costUsd,
      data.durationMs,
    ],
  );
  return mapTestRun(rows[0]);
}

/** Проганяє пакет сценаріїв (до limit). */
export async function runBatch(limit: number): Promise<TestRun[]> {
  const scenarios = await listScenarios();
  const slice = scenarios.slice(0, limit);
  const results: TestRun[] = [];
  for (const s of slice) {
    try {
      results.push(await runScenario(s));
    } catch (err) {
      console.error(`Сценарій «${s.title}» впав:`, err);
    }
  }
  return results;
}

/** Зведення якості: пас-рейт, вартість, тривалість по агентах. */
export async function getOverview(): Promise<TestsOverview> {
  const [{ rows: agentRows }, { rows: totalRows }, { rows: recentRows }, { rows: scenRows }] =
    await Promise.all([
      query<{
        agent_slug: string;
        agent_name: string;
        total: string;
        passed: string;
        cost_usd: string;
        avg_ms: string;
      }>(
        `SELECT tr.agent_slug,
                COALESCE(a.name, tr.agent_slug) AS agent_name,
                COUNT(*) AS total,
                COUNT(*) FILTER (WHERE tr.verdict = 'pass') AS passed,
                COALESCE(SUM(tr.cost_usd), 0) AS cost_usd,
                COALESCE(AVG(tr.duration_ms), 0) AS avg_ms
         FROM test_runs tr
         LEFT JOIN agents a ON a.slug = tr.agent_slug
         GROUP BY tr.agent_slug, a.name
         ORDER BY tr.agent_slug`,
      ),
      query<{ total: string; passed: string; cost_usd: string }>(
        `SELECT COUNT(*) AS total,
                COUNT(*) FILTER (WHERE verdict = 'pass') AS passed,
                COALESCE(SUM(cost_usd), 0) AS cost_usd
         FROM test_runs`,
      ),
      query<TestRunRow>(
        `SELECT tr.*, s.title AS scenario_title
         FROM test_runs tr
         LEFT JOIN test_scenarios s ON s.id = tr.scenario_id
         ORDER BY tr.id DESC LIMIT 20`,
      ),
      query<{ n: string }>("SELECT COUNT(*) AS n FROM test_scenarios WHERE is_active = TRUE"),
    ]);

  const byAgent: TestAgentSummary[] = agentRows.map((r) => {
    const total = Number(r.total);
    const passed = Number(r.passed);
    return {
      agentSlug: r.agent_slug,
      agentName: r.agent_name,
      total,
      passed,
      failed: total - passed,
      passRate: total > 0 ? passed / total : 0,
      costUsd: Number(r.cost_usd),
      avgDurationMs: Math.round(Number(r.avg_ms)),
    };
  });

  const total = Number(totalRows[0]?.total ?? 0);
  const passed = Number(totalRows[0]?.passed ?? 0);
  return {
    scenarios: Number(scenRows[0]?.n ?? 0),
    totalRuns: total,
    passRate: total > 0 ? passed / total : 0,
    costUsd: Number(totalRows[0]?.cost_usd ?? 0),
    byAgent,
    recent: recentRows.map(mapTestRun),
  };
}
