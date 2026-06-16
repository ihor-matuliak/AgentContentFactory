# План реалізації: генерація зображень Дизайнером через Higgsfield + гейт схвалення

**Специфікація:** [`../specs/2026-06-16-higgsfield-designer-image-generation-design.md`](../specs/2026-06-16-higgsfield-designer-image-generation-design.md)
**Принцип:** фази знизу-вгору, кожна — самостійно перевіряється (контрольна точка) перед наступною.

---

## Фаза 0 — Передумови та конфіг (паралельно)

**Файли:** `.env.example`, `apps/backend/src/env.ts`, `apps/backend/src/index.ts`

- Встановити `higgsfield` CLI на хост (`install.sh`), один раз `higgsfield auth login` (ручний крок, задокументувати).
- `.env.example`: додати `HIGGSFIELD_BIN`, `HIGGSFIELD_IMAGE_MODEL` (типово `text2image_soul_v2`), `HIGGSFIELD_TIMEOUT_MS` (типово 600000).
- `env.ts`: поля `higgsfieldBin`, `higgsfieldImageModel`, `higgsfieldTimeoutMs`.
- `index.ts`: тихий старт-чек (warning, якщо CLI не знайдено) — як інфо-прапорець Claude.

**Перевірка:** `higgsfield account status` повертає ОК; бекенд стартує без помилок.

---

## Фаза 1 — БД + спільні типи

**Файли:** `db/migrate_higgsfield.sql` (новий), `db/migrate.sh`, `packages/shared/src/index.ts`

- Міграція (ідемпотентна): таблиця `generated_assets` (див. §7 спеки) + `ALTER TABLE content_drafts ADD COLUMN IF NOT EXISTS image_urls TEXT[]`; індекси `(task_id)`, `(run_id)`, `(project_id)`. Підключити у `migrate.sh`.
- Типи `@swarm/shared`: `GeneratedAsset`; `RunTask.status` додає `'awaiting_approval'` + поле `generatedAssets?: GeneratedAsset[]`; `ContentDraft.imageUrls: string[]`; `VisualDecisionRequest { decision: 'approve'|'rework'; comment?: string; projectId }`.

**Перевірка:** `npm run db:migrate` двічі (ідемпотентність); `npm run typecheck --workspace @swarm/shared`.

---

## Фаза 2 — Сервіс Higgsfield (`apps/backend/src/higgsfield.ts`, новий)

- `generateImages(opts)` (сигнатура зі спеки §4): будує команду CLI, спавнить через `child_process`, парсить `--json`, завантажує result-URL у `uploads/generated/<runId>/`, повертає `{ images, costUsd }`.
- Вибір моделі: дефолт `text2image_soul_v2` (`--quality 2k`); `nano_banana_2` коли є `refImagePaths`; override `HIGGSFIELD_IMAGE_MODEL`.
- Обробка `count>1` (послідовно за потреби), таймаут, помилки auth/session.

**Перевірка:** юніт із мок-`child_process` — парсинг `--json`, вибір моделі (з/без референсів), формування шляхів; `npm run typecheck --workspace @swarm/backend`. (Опційно — 1 реальна генерація вручну.)

---

## Фаза 3 — Інструмент `generate_image` + зберігання ассетів

**Файли:** `apps/backend/src/agents/tools.ts`, `apps/backend/src/store.ts` (або новий `assets.ts`)

- `store`: `createGeneratedAsset`, `listAssetsByTask`, `setAssetStatus`, `listApprovedAssetsByTask`.
- `buildTaskTools`: для `agentSlug === 'designer'` додаємо інструмент `generate_image(prompt, count?, aspect_ratio?, use_references?)`. Обробник: резолвить референси зі «Знань» (`cover_photo`+`style_reference`, видимі Дизайнеру) → `higgsfield.generateImages` → `createGeneratedAsset` (status `generated`) → `accrue` → повертає URL-и агенту. Додаємо `getGeneratedAssets()` у контекст інструментів.

**Перевірка:** юніт резолву референсів; `typecheck` бекенд.

---

## Фаза 4 — Маршрутизація гейту в оркестраторі + пауза черги

**Файли:** `apps/backend/src/agents/orchestrator.ts`, `apps/backend/src/agents/queue.ts`

- `executeTask`: після агента, якщо `tools.getGeneratedAssets().length > 0` → `setTaskResult` + статус `awaiting_approval` (пропускаємо `reviewByCritic`); `addEvent("visual_approval", …)` + `notifyOwner`. Інакше — без змін.
- Промпт виконавця-Дизайнера: інструкція використати `generate_image` для візуальних завдань.
- `queue.ts`: `runHasBlockingTask` рахує `awaiting_approval` блокуючим. Підтвердити, що `resumeQueue` повертає в чергу лише `in_progress` (не чіпає `awaiting_approval`).

**Перевірка:** інтеграція з мок-Higgsfield: завдання Дизайнера → `awaiting_approval`; прогін не фіналізується, сусідні завдання не стартують.

---

## Фаза 5 — Ендпоінт схвалення + замикання петлі

**Файли:** `apps/backend/src/routes/runs.ts`, `apps/backend/src/content.ts`

- `POST /api/runs/:id/tasks/:taskId/visual` (`VisualDecisionRequest`), працює коли `run.status='running'` і `task.status='awaiting_approval'`:
  - `approve` → assets `approved`; task `approved`; `draftFromApprovedTask` (ідемпотентний, заповнює `image_urls` зі схвалених assets); `kickQueue()`.
  - `rework` → task `pending`, `revision_round++`, `ownerFeedback=comment`; assets `rejected`; `kickQueue()`.
- `draftFromApprovedTask`: розширити для `image_urls` + гард проти дубля чернетки за `task_id`.
- `GET /api/runs/:id`: у кожному `RunTask` повертати `generatedAssets`.

**Перевірка:** інтеграція approve→рій продовжується; rework→перегенерація+гейт знову; чернетка не дублюється.

---

## Фаза 6 — UI дашборда

**Файли:** `apps/dashboard/src/lib/api.ts`, `app/projects/[slug]/runs/[id]/page.tsx`, `components/ui.tsx`, календар/чернетки

- `api.ts`: `visualDecision(runId, taskId, body)`; типи; деталі прогону включають `generatedAssets`.
- Сторінка прогону: для `awaiting_approval`-завдання — картка-гейт (стрічка `<img>` з `/uploads`, коментар, кнопки ✓/↺). Скіли `/frontend-design` + `/ui-ux-pro-max`, стиль «командний центр вулика».
- `ui.tsx`: бейдж статусу «Чекає на схвалення візуалу» (амбер).
- Календар/чернетки: показ `imageUrls`.

**Перевірка:** `npm run typecheck` (усі 3 пакети); ручний клік-через гейту.

---

## Фаза 7 — Документація + фінальні перевірки

**Файли:** `CLAUDE.md`, `.env.example`

- CLAUDE.md: інтеграція Higgsfield (CLI/сесія), `generate_image`, гейт `awaiting_approval`, `generated_assets`, нові env, передумови.
- Повний `npm run typecheck`; ручний E2E з реальним CLI: прогін-карусель → гейт → схвалення → чернетка/календар із зображеннями.

---

## Порядок і залежності

`0` (паралельно) → `1` → `2` → `3` → `4` → `5` → `6` → `7`.
Кожна фаза має власну контрольну точку; до наступної переходимо лише після зеленої перевірки.

## Ризики

- **CLI/сесія недоступні в продакшені** → завдання `failed` зі зрозумілою помилкою; задокументувати `auth login`.
- **Soul не приймає image-refs** → фолбек `nano_banana_2` (перевірити на Фазі 2 реальним викликом).
- **Вартість/латентність генерації** → таймаут + облік; реальні виклики Higgsfield платні — мінімізувати в автотестах (мок CLI).
