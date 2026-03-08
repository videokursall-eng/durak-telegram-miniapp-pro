# Single-origin развёртывание (один домен)

## Цель

Весь Telegram Mini App работает с одного домена, например **https://app.rasklad-taro.online**:

- Backend раздаёт собранный фронт
- Обрабатывает Telegram-авторизацию (`/auth/telegram`)
- Обрабатывает WebSocket (`/ws`)
- Игровой API — те же маршруты, что и раньше

Это устраняет проблемы с CORS, origin mismatch и WebSocket при разнесённых фронте и бэкенде.

## Итоговая архитектура

| Публичный адрес | Описание |
|-----------------|----------|
| **https://app.rasklad-taro.online** | Один origin для всего приложения |

**Backend (Node)** слушает `127.0.0.1:8080` (или другой порт за reverse proxy) и обслуживает:

- `GET /` — SPA (index.html или статика из сборки фронта)
- `GET /assets/*`, `*.js`, `*.css` — статические файлы из `apps/web/dist`
- `POST /auth/telegram` — Telegram-авторизация
- `GET /ws` — WebSocket (upgrade)
- `GET /health`, `/healthz`, `/readyz` — health checks
- `POST /auth/dev` — только в dev (APP_ENV=development)

Любой GET-запрос, не попавший в маршруты бэкенда и не найденный как файл в статике, возвращает **index.html** (SPA fallback).

## Изменённые файлы

| Файл | Изменения |
|------|-----------|
| **apps/server/package.json** | Зависимость `@fastify/static` |
| **apps/server/src/app.ts** | Опция `staticRoot`, регистрация `@fastify/static`, SPA fallback через `setNotFoundHandler`, `buildApp` сделан async |
| **apps/server/src/index.ts** | Вычисление `staticRoot` (по умолчанию `../../web/dist` от server dist), передача в `buildApp`, `await buildApp()` |
| **apps/server/tests/telegram-auth.test.mjs** | `await buildApp()` вместо `buildApp()` |
| **apps/server/.env.example** | Секция production с single-origin (PUBLIC_BASE_URL, PUBLIC_WEB_APP_URL, STATIC_ROOT) |
| **apps/web/src/net/runtimeConfig.ts** | В production: API и WS всегда с текущего origin (без VITE_SERVER_ORIGIN / VITE_API_BASE_URL) |

## Раздача статики

- **Путь сборки фронта:** `apps/web/dist` (после `pnpm build` в корне или `pnpm --filter web build`).
- **Плагин:** `@fastify/static` с `root: path.resolve(staticRoot)`, `index: ['index.html']`, `prefix: '/'`.
- **Порядок:** Сначала регистрируются все маршруты бэкенда (`/health`, `/auth/telegram`, `/auth/dev`, `/ws` и т.д.), затем статика. Так пути `/auth/*` и `/ws` не отдаются статикой.
- **SPA fallback:** `setNotFoundHandler`: для `GET` возвращается `index.html`, для остальных — 404.

## SPA fallback

- Обработчик 404 устанавливается после регистрации статики.
- Условие: `request.method === "GET"` → `reply.type("text/html").sendFile("index.html")`.
- Остальные методы → `reply.code(404).send()`.

## Как фронт определяет origin

- **В development** (`import.meta.env.DEV === true`): используются `VITE_API_BASE_URL` / `VITE_WS_BASE_URL` или дефолт `http://127.0.0.1:8080`.
- **В production**: всегда **same-origin** — `getApiBaseUrl()` возвращает `window.location.origin`, `getWebSocketUrl()` — `wss://${window.location.host}/ws`. Переменные `VITE_SERVER_ORIGIN`, `VITE_API_BASE_URL`, `VITE_WS_URL` в production не используются.

## WebSocket bootstrap

- Не менялся: клиент подключается к `/ws` с токеном в Sec-WebSocket-Protocol (и опционально в query в dev).
- Сервер валидирует токен, регистрирует клиента, отправляет `connection.ready`.
- Фронт снимает статус "connecting" при `onopen` и при получении `connection.ready`.

## Production env

Рекомендуемые переменные для одного домена:

```env
APP_ENV=production
HOST=127.0.0.1
PORT=8080
TRUST_PROXY=true
TELEGRAM_BOT_TOKEN=<from BotFather>
PUBLIC_BASE_URL=https://app.rasklad-taro.online
PUBLIC_WEB_APP_URL=https://app.rasklad-taro.online
CORS_ALLOWED_ORIGINS=https://app.rasklad-taro.online
# Опционально, если сборка не в ../../web/dist относительно server dist:
# STATIC_ROOT=/var/app/web/dist
```

## Проверка

1. **Сборка:** `pnpm build` — собираются shared, server, web; в `apps/web/dist` появляется production-сборка.
2. **Запуск backend:** `pnpm --filter @durak/server start` (или `pnpm dev` только для server). Сервер слушает 8080 и при наличии `apps/web/dist` раздаёт фронт.
3. **Открыть:** `http://127.0.0.1:8080` — должен открыться фронт (index.html).
4. **Telegram-авторизация:** `POST /auth/telegram` с `initData` — без изменений.
5. **WebSocket:** после авторизации `GET /ws` с токеном, сервер отправляет `connection.ready`.
6. **Игровой flow:** create room, join room, start game — без изменений, backend остаётся authoritative.

## Подтверждение

- **Frontend** — отдаётся с того же origin (статика и SPA fallback с backend).
- **Telegram auth** — `POST /auth/telegram` на том же домене.
- **WebSocket** — `wss://app.rasklad-taro.online/ws` (текущий origin).
- **Room flow** — без изменений, один origin.

Ограничения соблюдены: игровая логика, Telegram auth и WebSocket handshake не ломаются; client-only логика не вводится; backend остаётся authoritative game server.
