Продовжуємо проєкт «Agent Content Factory». Зараз будуємо фундамент. Наприкінці ми маємо побачити робочий дашборд у браузері з живим чатом зі Стратегом.

Зроби:

1. Спільний пакет типів packages/shared (назва пакета @swarm/shared) на TypeScript — сюди винесемо спільні типи даних (агент, повідомлення чату тощо).

2. База даних PostgreSQL. Створи папку db/ зі скриптами:
   - schema.sql — схема. Поки що створи таблиці: agents (id, slug, name, role, system_prompt, status, is_active) та chat_messages (id, agent_id, role, content, created_at).
   - seed.sql — дані одного агента: Стратег (slug strategist) із характером-промптом (системний промпт описує його як оркестратора-планувальника, спілкується українською, приязно).
   - setup.sh — створює роль swarm (пароль swarm) і базу ai_agent_swarm у локальному PostgreSQL, потім застосовує schema.sql та seed.sql. Важливо: не чіпати інші бази на комп'ютері.
   - seed.sh та reset.sh — оновити дані агентів / перестворити базу з нуля.
   Додай у кореневий package.json команди: db:setup, db:seed, db:reset.

3. Бекенд apps/backend (назва @swarm/backend) на Node.js + Express 5 (TypeScript, запуск через tsx):
   - src/env.ts — читає налаштування з .env.
   - src/db.ts — підключення до PostgreSQL.
   - src/index.ts — запуск сервера на порту з BACKEND_PORT, маршрут перевірки GET /api/health.
   - src/routes/agents.ts — список агентів та історія чату.
   - src/agents/conversational.ts — «рушій діалогу» поверх Claude Agent SDK (@anthropic-ai/claude-agent-sdk): бере системний промпт агента з бази, історію чату, відправляє повідомлення в Claude, зберігає відповідь. Доступ до Claude через CLAUDE_CODE_OAUTH_TOKEN (або ANTHROPIC_API_KEY як резервний), модель із ANTHROPIC_MODEL.
   - Маршрут POST /api/agents/:slug/chat — відправити повідомлення агенту й отримати відповідь.

4. Дашборд apps/dashboard (назва @swarm/dashboard) на Next.js 16 + React 19 + Tailwind CSS 4 (TypeScript):
   - src/lib/api.ts — взаємодія з бекендом (адреса з NEXT_PUBLIC_BACKEND_URL).
   - src/components/Sidebar.tsx — бічне меню.
   - Сторінка / (огляд) та сторінка чату зі Стратегом, де можна листуватися, а історія зберігається в базі.

5. У кореневий package.json додай команди запуску: dev (бекенд і дашборд разом через concurrently), dev:backend, dev:dashboard, а також typecheck (перевірка типів і бекенду, і дашборду).

6. Запусти npm install, потім npm run db:setup, поясни мені як вставити токен в .env, і запусти npm run dev. Перевір, що http://localhost:4000/api/health відповідає і що на http://localhost:3000 відкриється дашборд із робочим чатом зі Стратегом. Наприкінці прогони npm run typecheck та виправ помилки, якщо вони є.

Адреси: дашборд — http://localhost:3000, бекенд — http://localhost:4000, база — localhost:5432 (ai_agent_swarm, користувач swarm, пароль swarm).