-- Agent Content Factory — міграція для додавання глобального налаштування моделі ШІ (Gemini 3.1 Flash Lite).

CREATE TABLE IF NOT EXISTS system_settings (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
);

-- Запишемо модель по дефолту: 'claude-sonnet-4-6'
INSERT INTO system_settings (key, value)
VALUES ('active_model', 'claude-sonnet-4-6')
ON CONFLICT (key) DO NOTHING;
