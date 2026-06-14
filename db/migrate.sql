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
