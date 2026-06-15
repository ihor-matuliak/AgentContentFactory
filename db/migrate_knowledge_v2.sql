-- Agent Content Factory — База знань v2 (типи джерел + видимість для агентів).
--
-- Ідемпотентна міграція: безпечно застосовується повторно, дані не втрачаються.
-- Додає до knowledge_sources:
--   • source_type        — категорія матеріалу (document | cover_photo | style_reference)
--   • visible_to_agents  — масив slug-ів агентів, яким видно джерело
--                          (NULL або порожній масив = видно ВСІМ агентам проєкту)

BEGIN;

-- 1) Тип джерела. Наявні рядки трактуємо як документи.
ALTER TABLE knowledge_sources
    ADD COLUMN IF NOT EXISTS source_type TEXT NOT NULL DEFAULT 'document';

-- Backfill для будь-яких рядків, що могли лишитися без типу.
UPDATE knowledge_sources
   SET source_type = 'document'
 WHERE source_type IS NULL OR source_type = '';

-- 2) Видимість для агентів (NULL = видно всім).
ALTER TABLE knowledge_sources
    ADD COLUMN IF NOT EXISTS visible_to_agents TEXT[];

-- 3) Індекси під нові поля фільтрації.
--    source_type — для лічильників/вкладок; visible_to_agents — GIN під оператор @>/ANY.
CREATE INDEX IF NOT EXISTS idx_knowledge_sources_type
    ON knowledge_sources (project_id, source_type);
CREATE INDEX IF NOT EXISTS idx_knowledge_sources_visible
    ON knowledge_sources USING GIN (visible_to_agents);

COMMIT;
