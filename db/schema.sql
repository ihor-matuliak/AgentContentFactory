-- Agent Content Factory — схема бази даних (Фаза 1)
-- Застосовується до бази ai_agent_swarm.

-- Агенти рою.
CREATE TABLE IF NOT EXISTS agents (
    id            SERIAL PRIMARY KEY,
    slug          TEXT NOT NULL UNIQUE,
    name          TEXT NOT NULL,
    role          TEXT NOT NULL DEFAULT '',
    system_prompt TEXT NOT NULL DEFAULT '',
    status        TEXT NOT NULL DEFAULT 'idle'
                    CHECK (status IN ('idle', 'busy', 'offline')),
    is_active     BOOLEAN NOT NULL DEFAULT TRUE
);

-- Повідомлення чату з агентами.
CREATE TABLE IF NOT EXISTS chat_messages (
    id         SERIAL PRIMARY KEY,
    agent_id   INTEGER NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
    role       TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
    content    TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Швидкий доступ до історії конкретного агента в хронологічному порядку.
CREATE INDEX IF NOT EXISTS idx_chat_messages_agent_created
    ON chat_messages (agent_id, created_at);
