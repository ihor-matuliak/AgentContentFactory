-- Agent Content Factory — безпечна міграція (Фаза 3: прогони рою).
--
-- Застосовується до бази ai_agent_swarm роллю swarm.
-- ВАЖЛИВО: усе ідемпотентне — повторний запуск НЕ втрачає даних і не чіпає
-- таблиці agents / chat_messages. На свіжій базі таблиці створюються;
-- на наявній — лише добавляються відсутні колонки (ADD COLUMN IF NOT EXISTS).

-- ── Прогони рою: одна ціль власника = один прогін. ──
CREATE TABLE IF NOT EXISTS runs (
    id             SERIAL PRIMARY KEY,
    goal           TEXT NOT NULL,
    status         TEXT NOT NULL DEFAULT 'planning',
    size           TEXT NOT NULL DEFAULT 'small',
    summary        TEXT NOT NULL DEFAULT '',
    error          TEXT NOT NULL DEFAULT '',
    input_tokens   BIGINT NOT NULL DEFAULT 0,
    output_tokens  BIGINT NOT NULL DEFAULT 0,
    cost_usd       NUMERIC NOT NULL DEFAULT 0,
    max_budget_usd NUMERIC,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE runs ADD COLUMN IF NOT EXISTS status         TEXT NOT NULL DEFAULT 'planning';
ALTER TABLE runs ADD COLUMN IF NOT EXISTS size           TEXT NOT NULL DEFAULT 'small';
ALTER TABLE runs ADD COLUMN IF NOT EXISTS summary        TEXT NOT NULL DEFAULT '';
ALTER TABLE runs ADD COLUMN IF NOT EXISTS error          TEXT NOT NULL DEFAULT '';
ALTER TABLE runs ADD COLUMN IF NOT EXISTS input_tokens   BIGINT NOT NULL DEFAULT 0;
ALTER TABLE runs ADD COLUMN IF NOT EXISTS output_tokens  BIGINT NOT NULL DEFAULT 0;
ALTER TABLE runs ADD COLUMN IF NOT EXISTS cost_usd       NUMERIC NOT NULL DEFAULT 0;
ALTER TABLE runs ADD COLUMN IF NOT EXISTS max_budget_usd NUMERIC;
ALTER TABLE runs ADD COLUMN IF NOT EXISTS created_at     TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE runs ADD COLUMN IF NOT EXISTS updated_at     TIMESTAMPTZ NOT NULL DEFAULT now();

-- ── Дошка завдань прогону. ──
CREATE TABLE IF NOT EXISTS tasks (
    id             SERIAL PRIMARY KEY,
    run_id         INTEGER NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
    agent_slug     TEXT NOT NULL DEFAULT '',
    description    TEXT NOT NULL DEFAULT '',
    status         TEXT NOT NULL DEFAULT 'pending',
    result         TEXT NOT NULL DEFAULT '',
    critic_verdict TEXT NOT NULL DEFAULT '',
    critic_comment TEXT NOT NULL DEFAULT '',
    owner_feedback TEXT NOT NULL DEFAULT '',
    -- depends_on зберігає id завдань цього ж прогону.
    depends_on     INTEGER[] NOT NULL DEFAULT '{}',
    revision_round INTEGER NOT NULL DEFAULT 0,
    sort_order     INTEGER NOT NULL DEFAULT 0,
    input_tokens   BIGINT NOT NULL DEFAULT 0,
    output_tokens  BIGINT NOT NULL DEFAULT 0,
    cost_usd       NUMERIC NOT NULL DEFAULT 0,
    question       TEXT NOT NULL DEFAULT '',
    answer         TEXT NOT NULL DEFAULT '',
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS critic_verdict TEXT NOT NULL DEFAULT '';
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS critic_comment TEXT NOT NULL DEFAULT '';
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS owner_feedback TEXT NOT NULL DEFAULT '';
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS depends_on     INTEGER[] NOT NULL DEFAULT '{}';
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS revision_round INTEGER NOT NULL DEFAULT 0;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS sort_order     INTEGER NOT NULL DEFAULT 0;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS input_tokens   BIGINT NOT NULL DEFAULT 0;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS output_tokens  BIGINT NOT NULL DEFAULT 0;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS cost_usd       NUMERIC NOT NULL DEFAULT 0;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS question       TEXT NOT NULL DEFAULT '';
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS answer         TEXT NOT NULL DEFAULT '';

-- ── Стрічка сповіщень для власника (лічильник у дашборді). ──
CREATE TABLE IF NOT EXISTS events (
    id         SERIAL PRIMARY KEY,
    run_id     INTEGER REFERENCES runs(id) ON DELETE CASCADE,
    type       TEXT NOT NULL DEFAULT 'info',
    title      TEXT NOT NULL,
    body       TEXT NOT NULL DEFAULT '',
    is_read    BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Журнал роботи рою: хто (actor) що зробив по кожному прогону. ──
CREATE TABLE IF NOT EXISTS activity_log (
    id         SERIAL PRIMARY KEY,
    run_id     INTEGER NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
    actor      TEXT NOT NULL DEFAULT '',
    action     TEXT NOT NULL,
    detail     TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tasks_run     ON tasks (run_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_tasks_status  ON tasks (status);
CREATE INDEX IF NOT EXISTS idx_events_unread ON events (is_read, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_run  ON activity_log (run_id, created_at);

-- ════════════════════════ Фаза 4: фабрика контенту ════════════════════════════
-- Усе так само ідемпотентне: повторний запуск нічого не втрачає.

-- ── Профіль проєкту: єдиний бренд-контекст (один рядок, id = 1). ──
-- Домішується до характеру кожного агента перед кожним запитом до Claude.
-- Назва колонки тону — `tone_of_voice` (узгоджено з наявною схемою на машині).
CREATE TABLE IF NOT EXISTS project_profile (
    id            INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    business      TEXT NOT NULL DEFAULT '',
    audience      TEXT NOT NULL DEFAULT '',
    products      TEXT NOT NULL DEFAULT '',
    tone_of_voice TEXT NOT NULL DEFAULT '',
    taboos        TEXT NOT NULL DEFAULT '',
    examples      TEXT NOT NULL DEFAULT '',
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- Гарантуємо наявність єдиного рядка профілю.
INSERT INTO project_profile (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

-- ── Чернетки контенту: результат схваленого завдання-публікації. ──
CREATE TABLE IF NOT EXISTS content_drafts (
    id         SERIAL PRIMARY KEY,
    run_id     INTEGER REFERENCES runs(id) ON DELETE SET NULL,
    task_id    INTEGER REFERENCES tasks(id) ON DELETE SET NULL,
    agent_slug TEXT NOT NULL DEFAULT '',
    platform   TEXT NOT NULL DEFAULT 'other',
    title      TEXT NOT NULL DEFAULT '',
    body       TEXT NOT NULL DEFAULT '',
    status     TEXT NOT NULL DEFAULT 'draft',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- На наявній таблиці без agent_slug — додаємо колонку (additive, без втрати даних).
ALTER TABLE content_drafts ADD COLUMN IF NOT EXISTS agent_slug TEXT NOT NULL DEFAULT '';

-- ── Контент-план: що і коли публікуємо на майданчиках. ──
-- scheduled_for — TIMESTAMPTZ (узгоджено з наявною схемою); у коді нормалізуємо
-- до полудня UTC, щоб дата не «з'їжджала» на день при різних часових поясах.
CREATE TABLE IF NOT EXISTS content_plan (
    id            SERIAL PRIMARY KEY,
    draft_id      INTEGER REFERENCES content_drafts(id) ON DELETE SET NULL,
    run_id        INTEGER REFERENCES runs(id) ON DELETE SET NULL,
    platform      TEXT NOT NULL DEFAULT 'other',
    title         TEXT NOT NULL DEFAULT '',
    notes         TEXT NOT NULL DEFAULT '',
    scheduled_for TIMESTAMPTZ,
    status        TEXT NOT NULL DEFAULT 'planned',
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_content_plan_date ON content_plan (scheduled_for);
CREATE INDEX IF NOT EXISTS idx_drafts_run        ON content_drafts (run_id);

-- ════════════════════════ Фаза 5: мультипроєкти + платформа ════════════════════
-- Усе ідемпотентне: повторний запуск НЕ втрачає даних. Наявні рядки прогонів,
-- чатів і контенту приписуються до першого (демо) проєкту через backfill нижче.

-- ── Проєкти: один власник може вести кілька каналів/брендів одночасно. ──
CREATE TABLE IF NOT EXISTS projects (
    id          SERIAL PRIMARY KEY,
    slug        TEXT NOT NULL UNIQUE,
    name        TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    is_active   BOOLEAN NOT NULL DEFAULT TRUE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Перший демопроєкт (до нього прив'яжемо всі наявні дані). slug стабільний.
INSERT INTO projects (slug, name, description)
VALUES ('ai-proryv', 'AI ПРОРИВ', 'Демопроєкт фабрики контенту — автономне ведення соцмереж.')
ON CONFLICT (slug) DO NOTHING;

-- ── Прив'язка наявних таблиць до проєкту (project_id). ──
ALTER TABLE runs           ADD COLUMN IF NOT EXISTS project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE;
ALTER TABLE chat_messages  ADD COLUMN IF NOT EXISTS project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE;
ALTER TABLE content_drafts ADD COLUMN IF NOT EXISTS project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE;
ALTER TABLE content_plan   ADD COLUMN IF NOT EXISTS project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE;
ALTER TABLE events         ADD COLUMN IF NOT EXISTS project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE;

-- Backfill: усі «осиротілі» рядки приписуємо до найпершого проєкту (демо).
UPDATE runs           SET project_id = (SELECT id FROM projects ORDER BY id ASC LIMIT 1) WHERE project_id IS NULL;
UPDATE chat_messages  SET project_id = (SELECT id FROM projects ORDER BY id ASC LIMIT 1) WHERE project_id IS NULL;
UPDATE content_drafts SET project_id = (SELECT id FROM projects ORDER BY id ASC LIMIT 1) WHERE project_id IS NULL;
UPDATE content_plan   SET project_id = (SELECT id FROM projects ORDER BY id ASC LIMIT 1) WHERE project_id IS NULL;
UPDATE events         SET project_id = (SELECT id FROM projects ORDER BY id ASC LIMIT 1) WHERE project_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_runs_project    ON runs (project_id);
CREATE INDEX IF NOT EXISTS idx_chat_project    ON chat_messages (project_id, agent_id, created_at);
CREATE INDEX IF NOT EXISTS idx_drafts_project  ON content_drafts (project_id);
CREATE INDEX IF NOT EXISTS idx_plan_project    ON content_plan (project_id);
CREATE INDEX IF NOT EXISTS idx_events_project  ON events (project_id);

-- ── Бренд-профіль ПЕР-ПРОЄКТ. ──
-- Старий project_profile (один рядок id=1) лишаємо недоторканим; нова таблиця
-- project_profiles ключується project_id. Дані старого профілю переносимо в
-- профіль першого проєкту. Додано telegram_channel — chat_id каналу для публікацій.
CREATE TABLE IF NOT EXISTS project_profiles (
    project_id       INTEGER PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE,
    business         TEXT NOT NULL DEFAULT '',
    audience         TEXT NOT NULL DEFAULT '',
    products         TEXT NOT NULL DEFAULT '',
    tone_of_voice    TEXT NOT NULL DEFAULT '',
    taboos           TEXT NOT NULL DEFAULT '',
    examples         TEXT NOT NULL DEFAULT '',
    telegram_channel TEXT NOT NULL DEFAULT '',
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Перенос старого єдиного профілю (якщо був) у профіль першого проєкту.
INSERT INTO project_profiles (project_id, business, audience, products, tone_of_voice, taboos, examples)
SELECT (SELECT id FROM projects ORDER BY id ASC LIMIT 1),
       business, audience, products, tone_of_voice, taboos, examples
FROM project_profile WHERE id = 1
ON CONFLICT (project_id) DO NOTHING;

-- Гарантуємо профіль для кожного наявного проєкту.
INSERT INTO project_profiles (project_id)
SELECT id FROM projects
ON CONFLICT (project_id) DO NOTHING;

-- ── База знань: джерела + чанки з повнотекстовим пошуком (tsvector). ──
-- Конфіг 'simple' (без стемінгу) добре працює для української: токенізує слова,
-- не намагаючись їх нормалізувати під відсутній укр. словник.
CREATE TABLE IF NOT EXISTS knowledge_sources (
    id          SERIAL PRIMARY KEY,
    project_id  INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    title       TEXT NOT NULL DEFAULT '',
    kind        TEXT NOT NULL DEFAULT 'note',   -- note | file | reference
    path        TEXT NOT NULL DEFAULT '',
    bytes       INTEGER NOT NULL DEFAULT 0,
    chunk_count INTEGER NOT NULL DEFAULT 0,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS knowledge_chunks (
    id         SERIAL PRIMARY KEY,
    source_id  INTEGER NOT NULL REFERENCES knowledge_sources(id) ON DELETE CASCADE,
    project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    ordinal    INTEGER NOT NULL DEFAULT 0,
    content    TEXT NOT NULL DEFAULT '',
    tsv        tsvector GENERATED ALWAYS AS (to_tsvector('simple', content)) STORED,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_knowledge_chunks_tsv     ON knowledge_chunks USING GIN (tsv);
CREATE INDEX IF NOT EXISTS idx_knowledge_chunks_project ON knowledge_chunks (project_id);
CREATE INDEX IF NOT EXISTS idx_knowledge_sources_project ON knowledge_sources (project_id);

-- ── Фабрика тестів: типові сценарії по агентах + результати прогонів тестів. ──
-- Сценарії та їх прогони глобальні (агенти спільні для всіх проєктів).
CREATE TABLE IF NOT EXISTS test_scenarios (
    id         SERIAL PRIMARY KEY,
    agent_slug TEXT NOT NULL,
    title      TEXT NOT NULL,
    prompt     TEXT NOT NULL,
    rubric     TEXT NOT NULL DEFAULT '',
    is_active  BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_test_scenarios_unique ON test_scenarios (agent_slug, title);

CREATE TABLE IF NOT EXISTS test_runs (
    id            SERIAL PRIMARY KEY,
    scenario_id   INTEGER NOT NULL REFERENCES test_scenarios(id) ON DELETE CASCADE,
    agent_slug    TEXT NOT NULL,
    verdict       TEXT NOT NULL DEFAULT '',   -- pass | fail
    score         INTEGER,
    comment       TEXT NOT NULL DEFAULT '',
    answer        TEXT NOT NULL DEFAULT '',
    input_tokens  BIGINT NOT NULL DEFAULT 0,
    output_tokens BIGINT NOT NULL DEFAULT 0,
    cost_usd      NUMERIC NOT NULL DEFAULT 0,
    duration_ms   INTEGER NOT NULL DEFAULT 0,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_test_runs_scenario ON test_runs (scenario_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_test_runs_agent    ON test_runs (agent_slug);

-- ── Інбокс ідей: швидкі ідеї (з дашборда чи Telegram) → у прогін одним кліком. ──
CREATE TABLE IF NOT EXISTS idea_inbox (
    id         SERIAL PRIMARY KEY,
    project_id INTEGER REFERENCES projects(id) ON DELETE SET NULL,
    body       TEXT NOT NULL,
    source     TEXT NOT NULL DEFAULT 'dashboard',  -- dashboard | telegram
    status     TEXT NOT NULL DEFAULT 'new',        -- new | converted | archived
    run_id     INTEGER REFERENCES runs(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_idea_inbox_status ON idea_inbox (status, created_at DESC);
