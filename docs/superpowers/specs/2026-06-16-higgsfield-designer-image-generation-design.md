# Дизайн: генерація зображень Дизайнером через Higgsfield + гейт схвалення

**Дата:** 2026-06-16
**Статус:** затверджено до планування
**Контекст:** Agent Content Factory — рій ШІ-агентів. Зараз Дизайнер віддає лише текстовий бриф; ціль — навчити його **генерувати реальні зображення** (обкладинки + слайди каруселі) через Higgsfield, з людським гейтом схвалення посеред прогону.

## 1. Мета й результат

Дизайнер у межах прогону рою має:
1. Згенерувати 1…N зображень через Higgsfield (кількість визначається з тексту завдання).
2. Зупинити прогін на **гейті схвалення**: власник дивиться зображення → **схвалює** (рій рухається далі) або **відправляє на доопрацювання** з коментарем (Дизайнер перегенеровує).
3. Після схвалення зображення замикають контент-петлю: чернетка + запис у контент-плані.

Працює headless у фоновій черзі (прогін може бути запущений з дашборда без Claude у петлі).

## 2. Обсяг (scope)

**У межах:**
- Інтеграція Higgsfield у бекенд через CLI.
- Новий інструмент Дизайнера `generate_image`.
- Гейт схвалення посеред прогону (новий статус завдання, пауза черги, цикл доопрацювання).
- Зберігання згенерованих зображень + замикання петлі (чернетка/план).
- UI картки-гейту на сторінці прогону, показ зображень.

**Поза межами (YAGNI):**
- Перегенерація **окремого** зображення (тільки повернення всього набору на доопрацювання з коментарем). Можливе майбутнє розширення.
- Відео/3D/аудіо Higgsfield, Marketing Studio, Virality Predictor.
- Авто-Критик для візуальних завдань (суддя якості картинки — людина).
- Окремий шлях для solo-чату: solo-завдання вже створює прогін з одним завданням, тож гейт працює автоматично, окремий код не потрібен.

## 3. Архітектура

Та сама модель інтеграції, що вже діє для Claude у проєкті: бекенд викликає зовнішній **CLI** поверх **збереженої сесії** (не API-ключ). Higgsfield-skill керує саме CLI; задокументованого REST+ключ немає.

Потік:

```
Дашборд (ціль / пізніше — схвалення)
  → Черга + Оркестратор доходять до завдання Дизайнера
  → Агент-Дизайнер (Claude/Gemini) пише креативний промпт → викликає generate_image()
  → src/higgsfield.ts: підтягує референси зі «Знань» → спавнить higgsfield CLI → завантажує результати в uploads/generated/
  → higgsfield CLI → Higgsfield cloud (auth = збережена сесія)
  → зображення → рядки generated_assets (+ витрати в телеметрію)
  → завдання → статус awaiting_approval (гейт)
  → дашборд показує зображення → ✓ далі / ↺ перегенерувати
```

## 4. Інтеграція Higgsfield — `src/higgsfield.ts`

Новий сервіс-обгортка над CLI.

**API:**
```ts
generateImages(opts: {
  prompt: string;
  refImagePaths?: string[];   // локальні шляхи референсів зі «Знань»
  count?: number;             // типово 1
  aspectRatio?: string;       // типово "4:5"
  model?: string;             // типово text2image_soul_v2 (Soul 2.0)
  runId: number;
  timeoutMs?: number;
}): Promise<{ images: { path: string; url: string; bytes: number; mimeType: string }[]; costUsd: number | null }>
```

**Поведінка:**
- Будує команду: `higgsfield generate create <model> --prompt "…" [--image <ref> …] --aspect_ratio <ar> [--quality 2k] --wait --json` (+ `--wait-timeout`). Якщо `count > 1` і модель не підтримує батч — викликаємо послідовно `count` разів.
- Парсить `--json` (масив фінальних job-обʼєктів), дістає result-URL-и.
- Завантажує файли в `uploads/generated/<runId>/<uuid>.<ext>`; повертає relative-path + публічний `/uploads/...` URL (повторно використовуємо статику `/uploads`, додану в Базі знань).
- Витрати: якщо CLI віддає cost — повертаємо; інакше `null`.
- **Вибір моделі (за замовчуванням — Higgsfield Soul):**
  - Дефолт — `text2image_soul_v2` (**Soul 2.0**), естетичні lifestyle/editorial візуали; передаємо `--quality 2k` (тир `1.5k`/`2k` мапиться на роздільність).
  - Якщо є **референси-зображення** (`refImagePaths`), а Soul не приймає `--image` для image-to-image — використовуємо `nano_banana_2` (reference-driven), щоб не втратити вплив референсів. (Для консистентності облич можливе майбутнє підключення `--soul-id` через `higgsfield-soul-id`.)
  - Усе перекривається через `HIGGSFIELD_IMAGE_MODEL`.
  - **Примітка/компроміс:** Soul сильний в естетиці, але для обкладинок із важким текстом/типографікою на зображенні `gpt_image_2` дає чіткіший on-image text — за потреби перемикається env-змінною.
- Помилки: «session expired» / «not authenticated» → кидаємо зрозумілу помилку (як auth-помилка Claude). Таймаут — як `AGENT_TIMEOUT_MS`, окремий `HIGGSFIELD_TIMEOUT_MS`.

**Авторизація / передумови:** CLI встановлюється на хост (`install.sh`), `higgsfield auth login` один раз. Старт-чек у `index.ts` (необовʼязковий, тихий warning) аналогічно перевірці креденшалів Claude. Env: `HIGGSFIELD_BIN` (шлях до CLI), `HIGGSFIELD_IMAGE_MODEL` (override моделі), `HIGGSFIELD_TIMEOUT_MS`.

## 5. Інструмент Дизайнера `generate_image`

У `agents/tools.ts`, доступний **лише** агенту `designer` (інші виконавці його не бачать).

- Опис інструмента: «Згенерувати зображення (обкладинку/слайди) через Higgsfield за твоїм промптом».
- Аргументи (zod): `prompt: string`, `count?: number` (1…N), `aspect_ratio?: string`, `use_references?: boolean` (типово true).
- Обробник:
  1. Якщо `use_references` — резолвить локальні шляхи до зображень зі «Знань» (`cover_photo` + `style_reference`, видимих Дизайнеру; топ-кілька) і передає як `refImagePaths`.
  2. Викликає `higgsfield.generateImages(...)`.
  3. Створює рядки `generated_assets` (status `generated`), привʼязані до `runId/taskId`.
  4. Нараховує витрати (`accrue`).
  5. Повертає агенту перелік URL-ів (текстом), щоб він міг описати набір у `submit_deliverable`.
- Контекст інструмента (як у `buildTaskTools`): додаємо `getGeneratedAssets()`/прапорець, щоб оркестратор знав, що завдання згенерувало візуал.

**Промпт виконавця** (orchestrator): для Дизайнера додаємо інструкцію — «якщо завдання потребує візуалу (обкладинка/карусель), напиши сильний промпт і виклич `generate_image` (кількість — з завдання), за потреби спираючись на референси; тоді здай набір через `submit_deliverable`».

## 6. Гейт схвалення посеред прогону

**Статус завдання:** новий `awaiting_approval` (вільний текст, без CHECK — як уся схема).

**Маршрутизація в `executeTask` (orchestrator):**
- Після виклику агента: якщо завдання згенерувало ≥1 `generated_assets` (через `generate_image`) → зберігаємо результат (`setTaskResult`) і ставимо статус `awaiting_approval` замість `reviewByCritic`/`done`. Авто-Критика для таких завдань **пропускаємо**.
- Інакше — поведінка без змін (Критик → done).

**Черга (`queue.ts`):**
- `runHasBlockingTask(runId)` додатково рахує `awaiting_approval` блокуючим → прогін не фіналізується, інші завдання не стартують. (Залежні й так чекають через `depends_on`; незалежні завдання теж чекають, бо прогін «на паузі».)
- `nextRunnableTask` не чіпає `awaiting_approval` (не «pending»/«in_progress»), тож воно не перевиконується.

**Сповіщення:** `addEvent("visual_approval", "Дизайнер чекає на схвалення візуалу", …, runId)` (лічильник у меню) + `notifyOwner(...)` (Telegram) з діплінком на прогін.

**Дії власника (новий ендпоінт):** `POST /api/runs/:id/tasks/:taskId/visual` з тілом `{ decision: "approve" | "rework", comment?: string, projectId }`. Працює коли `run.status === 'running'` і `task.status === 'awaiting_approval'`.
- `approve` → `generated_assets.status='approved'`; завдання → `approved`; `draftFromApprovedTask(...)` (розширений, див. §7); `kickQueue()` → рій рухається далі; лог + подія.
  - **Дедуп чернетки:** завдання, схвалене на гейті, стає `approved`. Наприкінці прогону огляд `/review` обробляє лише завдання, що ще не `approved`, тож `draftFromApprovedTask` для одного завдання викликається рівно раз. `draftFromApprovedTask` робимо ідемпотентним (не створює другу чернетку для того самого `task_id`).
- `rework` → завдання → `pending`, `revision_round++`, `ownerFeedback=comment`; (опційно) старі `generated_assets` → `rejected`; `kickQueue()` → Дизайнер перегенеровує з коментарем у контексті (наявний `buildRevisionNote`) → гейт знову. Цикл не обмежуємо.

**Фінальний огляд** прогону (`awaiting_review` + `/review`) лишається без змін — наприкінці.

## 7. Дані

**Нова таблиця `generated_assets`:**
```sql
id          SERIAL PRIMARY KEY
project_id  INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE
run_id      INTEGER NOT NULL REFERENCES runs(id) ON DELETE CASCADE
task_id     INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE
ordinal     INTEGER NOT NULL DEFAULT 0
prompt      TEXT NOT NULL DEFAULT ''
model       TEXT NOT NULL DEFAULT ''
path        TEXT NOT NULL DEFAULT ''   -- відносний шлях у /uploads
bytes       INTEGER NOT NULL DEFAULT 0
mime_type   TEXT NOT NULL DEFAULT ''
status      TEXT NOT NULL DEFAULT 'generated'  -- generated | approved | rejected
created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
```
Індекси: `(task_id)`, `(run_id)`, `(project_id)`.

**`content_drafts`:** додаємо `image_urls TEXT[]` (масив публічних URL схвалених зображень) — щоб чернетка/календар показували візуал.

**Міграція:** `db/migrate_higgsfield.sql` (ідемпотентна: `CREATE TABLE IF NOT EXISTS`, `ADD COLUMN IF NOT EXISTS`) + рядок у `db/migrate.sh` (по черзі після наявних міграцій).

**Замикання петлі:** `draftFromApprovedTask` розширюємо — якщо у завдання є `approved`-assets, у чернетку записуємо `image_urls`, платформа визначається як зараз (`detectPlatform`).

**Файли:** `uploads/generated/<runId>/…` (вже у `.gitignore` через `uploads/`).

## 8. API (бекенд)

- `POST /api/runs/:id/tasks/:taskId/visual` — рішення гейту (approve/rework), див. §6.
- `GET` згенерованих ассетів: розширюємо деталі прогону (`GET /api/runs/:id`) — у `RunTask` додаємо `generatedAssets: GeneratedAsset[]` (щоб картка-гейт мала зображення без окремого запиту).
- Статика `/uploads` — уже є.

## 9. UI дашборда

- **Сторінка прогону** `/projects/[slug]/runs/[id]`: для завдання у статусі `awaiting_approval` рендеримо **картку-гейт**: стрічка зображень (`<img>` з `api.backendUrl + url`), поле коментаря, кнопки **✓ Схвалити → рій рухається далі** / **↺ На доопрацювання**. Виклики — новий метод `api.visualDecision(...)`.
- **Статус-бейдж** прогону/завдання: новий стан «Чекає на схвалення візуалу» (амбер) у `ui.tsx`.
- **Сповіщення:** наявний лічильник подій + Telegram ведуть на прогін.
- **Календар/чернетки:** показ схвалених зображень із `image_urls`.
- **Типи `@swarm/shared`:** `GeneratedAsset`; оновлені `RunTask` (`status` додає `awaiting_approval`, поле `generatedAssets`), `ContentDraft` (`imageUrls`).
- Дизайн — у системі «командний центр вулика» (темний фон, бурштиновий акцент), скіли `/frontend-design` + `/ui-ux-pro-max`.

## 10. Витрати й телеметрія

Якщо CLI повертає cost — нараховуємо в `runs`/`tasks` (`accrue`), показуємо в наявній бюджет-смужці. Якщо ні — рахуємо кількість згенерованих зображень як проксі, cost = невідомо.

## 11. Крайові випадки

- **Збій/таймаут генерації** → інструмент повертає помилку агенту; агент може повторити або поставити `ask_owner`; за стійкого збою — завдання `failed` (наявний шлях), власник бачить помилку.
- **Сесія Higgsfield протухла** → зрозуміла помилка (як auth Claude); завдання `failed` з підказкою «виконай `higgsfield auth login`».
- **Кілька завдань Дизайнера в одному прогоні** → кожне гейтиться послідовно.
- **Рестарт бекенду під час `awaiting_approval`** → статус у БД зберігається; `resumeQueue` НЕ чіпає `awaiting_approval` (не `in_progress`), гейт лишається. Переконатися, що resume повертає в чергу лише `in_progress`.
- **Бюджет вичерпано** під час доопрацювання → наявний механізм `isOverBudget` зупиняє прогін.

## 12. Тестування

- Юніт: парсинг `--json` виводу CLI (мок), вибір моделі (з/без референсів), резолв референсів зі «Знань».
- Інтеграція (мок CLI): `executeTask` для Дизайнера → `awaiting_approval`; `runHasBlockingTask` бачить блокування; approve → рій рухається; rework → перегенерація.
- E2E (ручне, з реальним CLI): прогін з завданням-каруселлю → гейт → схвалення → чернетка/календар із зображеннями.
- Регресія: завдання НЕ-Дизайнера й текстові завдання Дизайнера (без `generate_image`) проходять як раніше (Критик → done).

## 13. Передумови деплою

1. Встановити `higgsfield` CLI на хост бекенду.
2. `higgsfield auth login` один раз (збережена сесія).
3. (Опційно) env: `HIGGSFIELD_BIN`, `HIGGSFIELD_IMAGE_MODEL`, `HIGGSFIELD_TIMEOUT_MS`.
4. `npm run db:migrate` (застосує `migrate_higgsfield.sql`).
