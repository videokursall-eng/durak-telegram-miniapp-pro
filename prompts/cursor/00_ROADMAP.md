# Cursor Roadmap — выполнять по порядку

## Правило
Одна задача = один PR.
Всегда:
- сначала план (файлы, интерфейсы)
- потом реализация
- потом тесты/линт
- потом короткий чеклист как проверить

---

## Task 00 — Repo scaffold (monorepo)
**Цель:** поднять монорепо pnpm + Vite React + server + shared.

Сделай:
1) `package.json` в корне + `pnpm-workspace.yaml`
2) `apps/web` (Vite + React + TS)
3) `apps/server` (Node + Fastify + TS)
4) `packages/shared` (TS, сборка)
5) Скрипты:
   - `pnpm dev` поднимает web+server
   - `pnpm lint`, `pnpm typecheck`, `pnpm test`
6) ESLint/Prettier/TSconfig базовые
7) Примерные `.env.example` уже есть — подключи их в конфиг.

Критерии готовности:
- `pnpm i`
- `pnpm dev`
- открывается web, server отдаёт `/health`

---

## Task 01 — Telegram WebApp bootstrap
**Цель:** корректно получить `initData`, theme params, показать “Connected”.

Сделай:
- `apps/web/src/telegram/telegram.ts` — wrapper
- React экран `ConnectedScreen`:
  - показывает user id/username
  - показывает кнопку “Войти” (auth)
- обработать отсутствие Telegram окружения (dev в браузере)

---

## Task 02 — Server auth: verify initData
**Цель:** `POST /auth/telegram` принимает initData, валидирует, возвращает token.

Сделай:
- endpoint `/health`
- endpoint `/auth/telegram`
- валидацию initData по Telegram алгоритму
- выдачу JWT

---

## Task 03 — WS gateway + room.join
**Цель:** WS `room.join` → `room.joined` + `state.snapshot`.

Сделай:
- WS endpoint `/ws`
- авторизация по JWT
- обработчик `room.join`
- модель комнаты в памяти (MVP)
- broadcast списка игроков

---

## Task 04 — Shared: модели карт + GameState skeleton
**Цель:** типы карт, колода, первичная раздача.

---

## Task 05 — Shared: applyAction для simple (2p)
**Цель:** атака/защита/бито/беру базово + тесты.

---

## Task 06 — UI table (React HUD + Phaser canvas)
**Цель:** отображение state snapshot: руки (counts), стол, козырь, колода.

---

## Task 07 — Transfer mode
**Цель:** действие `turn.transfer` + тесты на цепочки.

---

## Task 08 — Reconnect & sync
**Цель:** `sync.state`, восстановление, дедуп экшенов.

---

## Task 09 — Deploy checklist
**Цель:** подготовить `docs/DEPLOY.md` до реального деплоя, добавить healthchecks, CORS.
