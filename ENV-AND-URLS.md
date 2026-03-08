# Env и URL для запуска через Telegram

Согласование переменных окружения и публичных URL между backend, web и настройками бота.

---

## Требования к URL

- **Mini App URL** (то, что указывается в BotFather) должен быть **реально доступным HTTPS** адресом. Telegram не открывает `localhost` и не поддерживает HTTP для Mini App в продакшене.
- **Backend** должен быть доступен по **HTTPS** (API) и **WSS** (WebSocket), чтобы фронт из Telegram мог к нему обращаться (cross-origin).
- Все публичные URL должны быть **согласованы**: один и тот же домен/путь в BotFather, в CORS на сервере и в переменных сборки фронта.

---

## Схема согласования

| Где | Переменная / настройка | Назначение |
|-----|------------------------|------------|
| **BotFather** | Mini App URL / Menu Button | HTTPS URL фронта (тот же, что отдаёт хостинг). Не localhost. |
| **Backend** | `PUBLIC_WEB_APP_URL` | URL фронта (Mini App); при наличии добавляется в CORS. |
| **Backend** | `CORS_ALLOWED_ORIGINS` | Список origin’ов, с которых разрешены запросы; должен включать origin Mini App. |
| **Web (build)** | `VITE_TELEGRAM_MINI_APP_URL` | Публичный URL Mini App (для шаринга, отображения). Должен совпадать с URL в BotFather. |
| **Web (build)** | `VITE_SERVER_ORIGIN` / `VITE_API_BASE_URL` / `VITE_WS_URL` | Куда фронт ходит за API и WebSocket; должен указывать на ваш backend (HTTPS/WSS). |

Итог: **Mini App URL** = один и тот же HTTPS в BotFather и в `PUBLIC_WEB_APP_URL` / CORS; **backend** — отдельный (или тот же хост) с HTTPS/WSS, прописанный в `VITE_*` при сборке фронта.

---

## Backend: три режима

См. **apps/server/.env.example**:

1. **Local development** — `APP_ENV=development`, сервер на 127.0.0.1, CORS на localhost:5173. Для разработки без Telegram.
2. **Public tunnel / domain** — backend и фронт доступны по HTTPS (туннель или тестовый домен). `TELEGRAM_BOT_TOKEN` задан; в BotFather указан HTTPS URL фронта. CORS и `PUBLIC_WEB_APP_URL` совпадают с этим URL.
3. **Production** — `APP_ENV=production`, только Telegram auth, `TELEGRAM_BOT_TOKEN` обязателен. Mini App и backend по HTTPS/WSS; CORS и публичные URL согласованы с BotFather.

---

## Web: переменные

См. **apps/web/.env.example** и **apps/web/.env.local.example**:

- **VITE_APP_ENV** / **VITE_APP_MODE** — `development` | `production` (режим приложения и dev auth).
- **VITE_API_BASE_URL**, **VITE_WS_BASE_URL**, **VITE_WS_URL**, **VITE_SERVER_ORIGIN** — куда стучаться на API и WebSocket; в production должны быть HTTPS/WSS.
- **VITE_TELEGRAM_MINI_APP_URL** — публичный HTTPS URL Mini App (как в BotFather).
- **VITE_TELEGRAM_BOT_USERNAME**, **VITE_TELEGRAM_MINI_APP_SHORT_NAME** — для отображения/ссылок.
- **VITE_TELEGRAM_ONLY** — `1` = только Telegram auth (отключить dev auth даже в dev-сборке).
- **VITE_ISOLATED_DEV_MODE** — изолированный демо-режим без backend (опционально).

Для локальной разработки копируйте **.env.local.example** в **.env.local** и при необходимости переопределите только нужные переменные.

---

## Чеклист перед запуском в Telegram

- [ ] В BotFather указан **HTTPS** URL Mini App (не localhost).
- [ ] Backend доступен по **HTTPS** и **WSS** (тот же хост или отдельный).
- [ ] В `CORS_ALLOWED_ORIGINS` (или через `PUBLIC_WEB_APP_URL`) указан origin фронта (Mini App).
- [ ] Фронт собран с нужными **VITE_SERVER_ORIGIN** / **VITE_API_BASE_URL** / **VITE_WS_URL** (или аналогами), чтобы запросы шли на ваш backend.
- [ ] **VITE_TELEGRAM_MINI_APP_URL** совпадает с URL в BotFather (если используется для шаринга/отображения).
