-- Agent Content Factory — Higgsfield: згенеровані зображення Дизайнера.
--
-- Ідемпотентна міграція: безпечно застосовується повторно, дані не втрачаються.
-- Додає:
--   • таблицю generated_assets (зображення, привʼязані до завдання прогону)
--   • колонку content_drafts.image_urls (прикріплені до чернетки зображення)

BEGIN;

CREATE TABLE IF NOT EXISTS generated_assets (
    id          SERIAL PRIMARY KEY,
    project_id  INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    run_id      INTEGER NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
    task_id     INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    ordinal     INTEGER NOT NULL DEFAULT 0,
    prompt      TEXT NOT NULL DEFAULT '',
    model       TEXT NOT NULL DEFAULT '',
    path        TEXT NOT NULL DEFAULT '',          -- відносний шлях усередині /uploads
    bytes       INTEGER NOT NULL DEFAULT 0,
    mime_type   TEXT NOT NULL DEFAULT '',
    status      TEXT NOT NULL DEFAULT 'generated', -- generated | approved | rejected
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_generated_assets_task    ON generated_assets (task_id);
CREATE INDEX IF NOT EXISTS idx_generated_assets_run     ON generated_assets (run_id);
CREATE INDEX IF NOT EXISTS idx_generated_assets_project ON generated_assets (project_id);

-- Прикріплені до чернетки зображення (схвалений візуал Дизайнера).
ALTER TABLE content_drafts
    ADD COLUMN IF NOT EXISTS image_urls TEXT[];

-- Обрана перед запуском модель генерації зображень (NULL — серверний дефолт).
ALTER TABLE runs
    ADD COLUMN IF NOT EXISTS image_model TEXT;

COMMIT;
