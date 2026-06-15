# Agent Content Factory — Пам'ятка проєкту

## Опис проєкту
Ми будуємо **Agent Content Factory** — систему автономного ведення соціальних мереж, яка складається з **8 ШІ-агентів** (рій). Кожен агент має власний «характер» (системний промпт) і зону відповідальності. З кожним агентом можна листуватися віч-на-віч через дашборд, а також **зв'язати їх у рій**: одна ціль власника = один **прогін рою**, де Стратег планує й роздає завдання, виконавці їх роблять, Критик перевіряє, а Стратег пише підсумкове зведення.

Поверх цього працює **фабрика контенту** (Фаза 4): єдиний **бренд-профіль** домішується до кожного агента; **замкнута петля** перетворює схвалені завдання-публікації на чернетки й контент-план; є **контроль витрат** (бюджет/токени на прогін і завдання), **уточнювальні питання** агента до власника, **редагування плану** власником і **захист дашборда паролем**.

## Стек технологій
- **Архітектура:** Монорепозиторій на базі npm workspaces (`apps/*`, `packages/*`)
- **Дашборд (Фронтенд):** Next.js 16 (App Router, Turbopack) + React 19 + Tailwind CSS 4 — `apps/dashboard` (`@swarm/dashboard`), порт **3000**
- **Бекенд:** Node.js + Express 5 + tsx (TypeScript Execute), `pg` — `apps/backend` (`@swarm/backend`), порт **4000**
- **Спільні типи:** `packages/shared` (`@swarm/shared`) — TS-типи `Agent`, `ChatMessage`, прогонів рою (`Run`, `RunTask`, `SwarmEvent`, `ActivityEntry`, `ReviewItem`…) і фабрики контенту (`ProjectProfile`, `ContentDraft`, `ContentPlanItem`, `Platform`, `BoardTask`, `UpdateTaskRequest`, `AuthStatusResponse`…) + запити/відповіді API
- **База даних:** PostgreSQL 16 — база `ai_agent_swarm`, роль/пароль `swarm`/`swarm`, порт 5432
- **Агенти:** Claude Agent SDK (`@anthropic-ai/claude-agent-sdk`), модель `claude-sonnet-4-6`; інструменти агентів — через zod + вбудований MCP-сервер SDK

## Структура репозиторію
- `apps/dashboard` — фронтенд:
  - `src/app/` — сторінки: `/` (Огляд), `/chats` + `/chats/[slug]` (чати, у Стратега — кнопка «Запустити прогін»), `/runs` + `/runs/[slug]` (прогони рою; бюджет, редагування плану, «повторити», копіювати, відповідь на питання), `/review` (на перевірці), `/tasks` (Канбан-дошка з drag&drop), `/calendar` (контент-план), `/profile` (бренд-профіль)
  - `src/components/` — `Sidebar.tsx` (лічильник сповіщень), `ui.tsx` (бейджі статусів/платформ, прогрес-бар), `icons.tsx`, `Markdown.tsx`, `CopyButton.tsx`, `AuthGate.tsx` (захист паролем)
  - `src/lib/api.ts` — клієнт бекенду (адреса з `NEXT_PUBLIC_BACKEND_URL`; шле заголовок `x-swarm-password`)
- `apps/backend` — бекенд:
  - `src/index.ts` — Express-застосунок, `GET /api/health`, публічний `/api/auth`, далі `requireAuth` + роутери `/api/agents`, `/api/runs`, `/api/events`, `/api/profile`, `/api/content`; на старті — `resumeQueue`
  - `src/routes/agents.ts` — список агентів, історія, чат
  - `src/routes/runs.ts` — прогони: створення/список/деталі, схвалення плану, рішення на перевірці, `repeat`, правка/додавання/видалення завдань, `answer` на уточнення
  - `src/routes/events.ts` — сповіщення + лічильник
  - `src/routes/profile.ts` — бренд-профіль (`GET`/`PUT`)
  - `src/routes/content.ts` — `/board` (дошка), `/drafts`, `/plan` (CRUD контент-плану)
  - `src/routes/auth.ts` — статус/логін + middleware `requireAuth`
  - `src/profile.ts` — читання/збереження профілю + `withProfile()` (домішує бренд-контекст у системний промпт КОЖНОГО агента)
  - `src/content.ts` — чернетки, контент-план, `draftFromApprovedTask()` (замкнута петля), `detectPlatform()`
  - `src/agents/conversational.ts` — рушій чату; `src/agents/handlers.ts` — реєстр `slug → обробник`
  - `src/agents/orchestrator.ts` — рушій прогону: планування → виконання (таймаут, уточнювальні питання) → Критик (до 2 кіл) → зведення
  - `src/agents/queue.ts` — фонова черга (послідовно; не фіналізує прогін, поки є завдання `waiting_question`/`in_progress`)
  - `src/agents/runner.ts` — виклик агента (текст + витрати + таймаут `AGENT_TIMEOUT_MS`); `src/agents/tools.ts` — «руки» агента (MCP, zod): `record_progress`, `submit_deliverable`, `ask_owner`
  - `src/store.ts` — `runs`/`tasks` (правки, дошка, уточнення); `src/journal.ts` — `activity_log` + `events`
  - `src/notify.ts` — Telegram-сповіщення; `src/scripts/telegram-chat-id.ts`
  - `src/env.ts`, `src/db.ts`
- `packages/shared` — спільні TS-типи
- `db/` — `schema.sql`, `seed.sql`, `migrate.sql` (безпечна ідемпотентна міграція Фаз 3–4) + скрипти `setup.sh` / `seed.sh` / `migrate.sh` / `reset.sh` / `backup.sh`

## Агенти та їхні «характери»
**Характери (особистості) агентів живуть у `db/seed.sql`, а не в коді.** Системний промпт із бази визначає тон і поведінку агента; обробник у `handlers.ts` лише обирає рушій (зараз — спільний `conversational.ts`). Щоб переписати будь-який характер: відредагуй промпт у `db/seed.sql` і виконай `npm run db:seed` — це **UPSERT за `slug`**, він оновлює дані агентів і **не стирає історію чатів**.

Поточний склад рою (8): `strategist` (Стратег), `scriptwriter` (Сценарист), `reelsmaker` (Рілсмейкер), `video-editor` (Монтажер), `designer` (Дизайнер), `publisher` (Публікатор), `programmer` (Програміст), `critic` (Критик). Усі промпти — **українською**, кожен агент відповідає українською у своєму тоні.

## Прогони рою (Фаза 3)
- **Потік:** власник ставить ціль на `/runs` → Стратег планує завдання → **дрібний** прогін стартує одразу, **великий** (кілька завдань) стає у статус «чекає схвалення плану» (власник тисне «Запустити рій») → виконавці роблять завдання по черзі, Критик перевіряє (до **2 кіл** автодоопрацювання) → Стратег пише зведення → статус «на твоїй перевірці» (`/review`), де власник схвалює або повертає на доопрацювання з коментарем.
- **Виконавці** = усі активні агенти, **крім** `strategist` та `critic`.
- **Черга** (`queue.ts`) виконує завдання послідовно у фоні, не блокуючи дашборд; джерело правди — БД, тож після рестарту бекенду незавершені завдання (`in_progress`) повертаються в чергу й підхоплюються.
- **Таблиці:** `runs`, `tasks` (з `depends_on`, `revision_round`, токени/вартість), `events` (сповіщення + лічильник у меню), `activity_log` (журнал «хто що зробив», поле `actor`). Статуси — вільний текст (без CHECK); канонічні набори описані в `@swarm/shared`.
- **Сповіщення:** опційний Telegram-бот (`.env`: `TELEGRAM_BOT_TOKEN`, `TELEGRAM_OWNER_CHAT_ID`) пише, коли план готовий і коли прогін завершено. Дізнатися chat_id: `npm run telegram:chat-id`. Без налаштувань рій працює без Telegram.

## Фабрика контенту (Фаза 4)
- **Бренд-профіль (`/profile`):** один рядок `project_profile` (бізнес, аудиторія, продукти, тон, табу, приклади). `src/profile.ts → withProfile()` домішує цей контекст до системного промпту КОЖНОГО агента перед будь-яким запитом до Claude — і в чаті (`conversational.ts`), і в прогоні (`runner.ts`). Колонка тону в БД зветься `tone_of_voice` (у типі/API — поле `tone`).
- **Замкнута петля:** коли власник схвалює завдання-публікацію (агент `publisher` або опис із ознаками публікації), `draftFromApprovedTask()` створює `content_drafts` + запис у `content_plan`. Майданчик визначається з тексту (`detectPlatform`: youtube/telegram/instagram/other). Сторінки `/calendar` (контент-план із датами/статусами) і `/tasks` (Канбан-дошка всіх завдань рою; статус міняється перетягуванням → `PATCH /api/runs/:id/tasks/:taskId`).
- **Контроль витрат:** токени й вартість рахуються на `runs` і `tasks` (накопичуються в `accrue`); опційний `max_budget_usd` на прогін (черга падає в `failed`, коли бюджет вичерпано). У UI — телеметрія й бюджетна смужка на сторінці прогону.
- **Розумніша зв'язка:** залежності завдань (`depends_on`); **уточнювальні питання** — інструмент `ask_owner` ставить завдання у `waiting_question` (черга не фіналізує прогін, доки є таке завдання), власник відповідає на `/runs/[id]` → `POST …/answer` → завдання повертається в чергу; **таймаут** на агента (`AGENT_TIMEOUT_MS`, типово 180с) у `runner.ts`; ретрай планування (`planWithRetry`).
- **Контроль власника:** редагування плану на `awaiting_approval` (правка опису, перепризначення виконавця, видалення/додавання завдань), «Повторити прогін» (`POST …/repeat`), кнопки «копіювати» біля результатів і зведення, запуск прогону прямо з чату зі Стратегом.
- **Захист дашборда:** `SWARM_PASSWORD` у `.env` (порожній — без авторизації). Бекенд: публічний `/api/auth` + middleware `requireAuth` (заголовок `x-swarm-password`); фронтенд: `AuthGate.tsx` зберігає пароль локально. `npm run db:backup` — дамп бази в `backups/` (зберігає 14 останніх).
- **Таблиці Фази 4:** `project_profile`, `content_drafts` (з `agent_slug`, доданим міграцією), `content_plan` (`scheduled_for` — `TIMESTAMPTZ`; у коді нормалізуємо до полудня UTC, щоб дата не зсувалась). Статуси — вільний текст; новий статус завдання — `waiting_question`. Як і у Фазі 3, ці таблиці **вже існували в БД з даними** — схему адаптовано під наявну, без втрати даних.

## Платформа: мультипроєкти + інтеграції (Фаза 5)
- **Мультипроєкти:** таблиця `projects`; до проєкту прив'язано **все** через `project_id` (`runs`, `chat_messages`, `content_drafts`, `content_plan`, `events`) + пер-проєктний профіль `project_profiles` (нова таблиця; старий однорядковий `project_profile` лишився, його дані перенесено в профіль першого проєкту). Агенти **спільні** для всіх проєктів; різниться лише контекст. Backfill міграцією приписав наявні дані до першого демопроєкту (`ai-proryv` «AI ПРОРИВ»).
  - **Навігація:** верхня (`TopNav`: Проєкти `/`, Інбокс ідей `/ideas`, Акаунт `/account`) + вкладені роути проєкту `/projects/[slug]/{,'',runs,review,calendar,tasks,chats,profile,knowledge,tests}`. `ProjectContext` вантажить проєкт за slug і дає `useProject()`; `ProjectSidebar` — бічне меню проєкту з лічильником. Усі скоуплені виклики API шлють `?projectId=N` (або в тілі).
  - Скоупінг на бекенді: хелпер `routes/projectScope.ts → getProjectId(req)`; `src/projects.ts` (CRUD), `src/chat.ts` (чат скоуплений `(agent_id, project_id)`), `src/context.ts → augmentSystemPrompt({systemPrompt, projectId, query})` домішує профіль + знання в КОЖЕН виклик агента (`conversational.ts`, `runner.ts`).
- **Прямі завдання агентам (Частина 2):** у чаті — «Поставити завдання» (`POST /api/runs/solo` — прогін одразу у `running` з одним завданням для агента, оминаючи планування), «Делегувати Стратегу» (`POST /api/runs` — планування), «Запустити прогін рою» (перехід на `/runs`).
- **База знань (Частина 3):** `knowledge_sources` + `knowledge_chunks` (повнотекст через `tsvector`, конфіг `simple`, GIN-індекс). `src/knowledge.ts` (чанкінг, інгест тексту/теки, `searchKnowledge`, `getKnowledgeBlock`). Сторінка «Знання»: нотатка, інгест теки, пошук, список джерел. CLI `npm run knowledge:ingest -- --dir=…`.
- **Двосторонній Telegram (Частина 4):** `src/telegram.ts` — long-polling приймає повідомлення власника (за `TELEGRAM_OWNER_CHAT_ID`) і маршрутизує: текст → Стратег; `/agent <slug> …`, `/task …`, `/idea …`, `/project <slug>`. Активний проєкт — у пам'яті модуля (типово перший). Публікація: `POST /api/content-plan/:id/publish/telegram` (кнопка «У Telegram» у Календарі для записів-`telegram`); chat_id каналу — поле `telegram_channel` у профілі проєкту. Запускається з `index.ts` через `startTelegramPolling()` (тихо, якщо токен/owner порожні).
- **Фабрика тестів (Частина 5):** `test_scenarios` (UNIQUE `agent_slug+title`) + `test_runs` (глобальні). `src/tests.ts`: `SEED_SCENARIOS`, `runScenario` (агент відповідає «голим» характером БЕЗ проєкт-контексту → Критик дає вердикт pass/fail+score), `runBatch`, `getOverview`. `npm run tests:seed`, `npm run tests:batch -- --limit=30`. Сторінка «Тести» — пас-рейт/вартість/час по агентах + останні прогони.
- **Інбокс ідей (Частина 6):** `idea_inbox` (`project_id` nullable, `source` dashboard|telegram). `src/ideas.ts` + `/api/ideas`; сторінка `/ideas` (верхній рівень): додати/архівувати, «У прогін» (`POST /api/ideas/:id/convert` → створює прогін у проєкті ідеї/обраному). Ідеї також надходять через Telegram `/idea …`.
- **Нові роути бекенду:** `/api/projects`, `/api/knowledge`, `/api/ideas`, `/api/tests`, `/api/content-plan/:id/publish/telegram`. Усі контентні/прогінні/чат-роути тепер вимагають `projectId`.

## Команди (root `package.json`)
- `npm run dev` — бекенд + дашборд разом (`concurrently`)
- `npm run dev:backend` — лише бекенд (плаский `tsx`, **без** watch)
- `npm run dev:dashboard` — лише дашборд
- `npm run typecheck` — перевірка типів усіх трьох пакетів
- `npm run db:setup` — створити роль/базу та застосувати `schema.sql` + `seed.sql` (потрібен `PGPASSWORD` суперкористувача `postgres`)
- `npm run db:seed` — лише оновити дані агентів (історія чатів зберігається)
- `npm run db:migrate` — безпечна ідемпотентна міграція (`migrate.sql`): додає таблиці прогонів і фабрики контенту **без втрати даних**
- `npm run db:reset` — перестворити базу з нуля
- `npm run db:backup` — дамп бази в `backups/` (зберігає 14 останніх копій)
- `npm run telegram:chat-id` — підказати свій Telegram chat_id для сповіщень
- `npm run knowledge:ingest -- --dir=/шлях [--project=slug]` — інгест матеріалів у базу знань проєкту (Фаза 5)
- `npm run tests:seed` — завантажити базовий набір тестових сценаріїв (Фаза 5)
- `npm run tests:batch -- --limit=30` — прогнати сценарії через агентів + Критика й записати вердикти (Фаза 5)

## Змінні оточення (`.env`, шаблон — `.env.example`)
- `DATABASE_URL` — підключення до PostgreSQL (типово `postgresql://swarm:swarm@localhost:5432/ai_agent_swarm`).
- `BACKEND_PORT` (4000) та `NEXT_PUBLIC_BACKEND_URL` (адреса бекенду для дашборда).
- Доступ до Claude (досить одного): `CLAUDE_CODE_OAUTH_TOKEN`, або `ANTHROPIC_API_KEY`, або збережений логін Claude Code. `ANTHROPIC_MODEL` (типово `claude-sonnet-4-6`).
- `TELEGRAM_BOT_TOKEN`, `TELEGRAM_OWNER_CHAT_ID` — Telegram: сповіщення + двосторонній режим (long-polling) у Фазі 5, якщо задано обидва. chat_id каналу для публікацій — у профілі проєкту, не в `.env`.
- `SWARM_PASSWORD` — пароль на дашборд (порожній → без авторизації).
- `AGENT_TIMEOUT_MS` — таймаут одного виклику агента (типово 180000).

## Важливі правила розробки
- **Конфігурація та безпека:** усі чутливі дані, токени та ключі зберігаються **виключно у файлі `.env`** у корені проєкту. Файл у `.gitignore` і ніколи не потрапляє до репозиторію. Шаблон — `.env.example`.
- **Доступ до Claude:** достатньо одного зі способів — `CLAUDE_CODE_OAUTH_TOKEN` (згенерувати `claude setup-token`), або `ANTHROPIC_API_KEY`, або збережений логін Claude Code на машині (`claude /login`). `src/env.ts` видаляє порожні значення з оточення, щоб порожній токен не перекривав збережений логін.
- **Пароль на дашборд:** `SWARM_PASSWORD` у `.env`. Порожній → авторизацію вимкнено (зручно локально). Якщо заданий — бекенд вимагає заголовок `x-swarm-password`, а `AuthGate` показує форму входу.
- **Дизайн UI:** для нових/змінених сторінок використовувати скіли `/frontend-design` і `/ui-ux-pro-max`. Орієнтовні референси структури — у папці `design_example/` (мова там не важлива, у нас усе українською). Концепція дизайну — «командний центр вулика»: темний фон, єдиний бурштиновий акцент, моноширинні цифри телеметрії.
- **Платформа:** Windows. **Скрипти `db:*` запускати через Git Bash, не PowerShell** (вони викликають `bash ./db/*.sh`; у PowerShell `bash` резолвиться у WSL і падає). Деталі неочевидного локального середовища — у пам'яті проєкту (`acf-dev-env`).
