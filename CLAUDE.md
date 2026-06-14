# Agent Content Factory — Пам'ятка проєкту

## Опис проєкту
Ми будуємо **Agent Content Factory** — систему автономного ведення соціальних мереж, яка складається з **8 ШІ-агентів** (рій). Кожен агент має власний «характер» (системний промпт) і зону відповідальності. Вже зараз з кожним агентом можна листуватися віч-на-віч через дашборд.

## Стек технологій
- **Архітектура:** Монорепозиторій на базі npm workspaces (`apps/*`, `packages/*`)
- **Дашборд (Фронтенд):** Next.js 16 (App Router, Turbopack) + React 19 + Tailwind CSS 4 — `apps/dashboard` (`@swarm/dashboard`), порт **3000**
- **Бекенд:** Node.js + Express 5 + tsx (TypeScript Execute), `pg` — `apps/backend` (`@swarm/backend`), порт **4000**
- **Спільні типи:** `packages/shared` (`@swarm/shared`) — TS-типи `Agent`, `ChatMessage`, запити/відповіді API
- **База даних:** PostgreSQL 16 — база `ai_agent_swarm`, роль/пароль `swarm`/`swarm`, порт 5432
- **Агенти:** Claude Agent SDK (`@anthropic-ai/claude-agent-sdk`), модель `claude-sonnet-4-6`

## Структура репозиторію
- `apps/dashboard` — фронтенд:
  - `src/app/` — сторінки: `/` (Огляд), `/chats` (список агентів), `/chats/[slug]` (чат з агентом)
  - `src/components/` — `Sidebar.tsx`, `ui.tsx`, `icons.tsx`
  - `src/lib/api.ts` — клієнт бекенду (адреса з `NEXT_PUBLIC_BACKEND_URL`)
- `apps/backend` — бекенд:
  - `src/index.ts` — Express-застосунок, `GET /api/health`, монтує роутер на `/api/agents`
  - `src/routes/agents.ts` — список агентів, історія, `POST /api/agents/:slug/chat`
  - `src/agents/conversational.ts` — спільний рушій діалогу поверх Claude Agent SDK
  - `src/agents/handlers.ts` — реєстр `slug → обробник` (усі агенти зараз через `conversational.ts`)
  - `src/env.ts`, `src/db.ts`
- `packages/shared` — спільні TS-типи
- `db/` — `schema.sql`, `seed.sql`, та скрипти `setup.sh` / `seed.sh` / `reset.sh`

## Агенти та їхні «характери»
**Характери (особистості) агентів живуть у `db/seed.sql`, а не в коді.** Системний промпт із бази визначає тон і поведінку агента; обробник у `handlers.ts` лише обирає рушій (зараз — спільний `conversational.ts`). Щоб переписати будь-який характер: відредагуй промпт у `db/seed.sql` і виконай `npm run db:seed` — це **UPSERT за `slug`**, він оновлює дані агентів і **не стирає історію чатів**.

Поточний склад рою (8): `strategist` (Стратег), `scriptwriter` (Сценарист), `reelsmaker` (Рілсмейкер), `video-editor` (Монтажер), `designer` (Дизайнер), `publisher` (Публікатор), `programmer` (Програміст), `critic` (Критик). Усі промпти — **українською**, кожен агент відповідає українською у своєму тоні.

## Команди (root `package.json`)
- `npm run dev` — бекенд + дашборд разом (`concurrently`)
- `npm run dev:backend` — лише бекенд (плаский `tsx`, **без** watch)
- `npm run dev:dashboard` — лише дашборд
- `npm run typecheck` — перевірка типів усіх трьох пакетів
- `npm run db:setup` — створити роль/базу та застосувати `schema.sql` + `seed.sql` (потрібен `PGPASSWORD` суперкористувача `postgres`)
- `npm run db:seed` — лише оновити дані агентів (історія чатів зберігається)
- `npm run db:reset` — перестворити базу з нуля

## Важливі правила розробки
- **Конфігурація та безпека:** усі чутливі дані, токени та ключі зберігаються **виключно у файлі `.env`** у корені проєкту. Файл у `.gitignore` і ніколи не потрапляє до репозиторію. Шаблон — `.env.example`.
- **Доступ до Claude:** достатньо одного зі способів — `CLAUDE_CODE_OAUTH_TOKEN` (згенерувати `claude setup-token`), або `ANTHROPIC_API_KEY`, або збережений логін Claude Code на машині (`claude /login`). `src/env.ts` видаляє порожні значення з оточення, щоб порожній токен не перекривав збережений логін.
- **Дизайн UI:** для нових/змінених сторінок використовувати скіли `/frontend-design` і `/ui-ux-pro-max`. Орієнтовні референси структури — у папці `design_example/` (мова там не важлива, у нас усе українською). Концепція дизайну — «командний центр вулика»: темний фон, єдиний бурштиновий акцент, моноширинні цифри телеметрії.
- **Платформа:** Windows. Деталі неочевидного локального середовища — у пам'яті проєкту (`acf-dev-env`).
