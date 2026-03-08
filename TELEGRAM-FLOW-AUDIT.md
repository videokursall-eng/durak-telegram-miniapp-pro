# Аудит Telegram flow

Полная проверка цепочки: Mini App → initData → backend auth → session → WebSocket → комната/игра.

---

## 1. Что уже реализовано

### 1.1 Инициализация Telegram WebApp SDK на клиенте

- **Где:** `apps/web/index.html`  
  Подключается скрипт `https://telegram.org/js/telegram-web-app.js` до загрузки приложения. Telegram выставляет `window.Telegram.WebApp` и при открытии Mini App заполняет `initData`.
- **Дополнительно:** В `apps/web/src/App.tsx` в `useEffect` вызываются `getTg()?.ready()`, `expand()`, `setBackgroundColor`, `setHeaderColor` — инициализация и оформление WebApp.

**Файлы:** `apps/web/index.html`, `apps/web/src/App.tsx` (строки 62–68).

---

### 1.2 Чтение initData на клиенте

- **Где:** `apps/web/src/lib/telegram.ts`
  - `getTg()` — возвращает `window?.Telegram?.WebApp ?? null`.
  - `getTelegramInitData()` — возвращает `tg?.initData?.trim()` или `null`.
  - `initDataUnsafe` используется в `getTelegramDisplayName()` (user) и `getTelegramStartParam()` (start_param).
  - `isTelegramMiniApp()` — `Boolean(getTg()?.initData)`.
- **Использование initData:** В `apps/web/src/net/gameSessionStore.ts` в `ensureAuthenticated()` вызывается `getTelegramInitData()`; при наличии значения формируется запрос на POST `/auth/telegram` с телом `{ initData }`.

**Файлы:** `apps/web/src/lib/telegram.ts`, `apps/web/src/net/gameSessionStore.ts` (около 672, 688–691).

---

### 1.3 Backend endpoint для Telegram auth

- **Где:** `apps/server/src/app.ts`
  - Константа `AUTH_TELEGRAM_PATH = "/auth/telegram"`.
  - Роут: `app.post(AUTH_TELEGRAM_PATH, async (request, reply) => { ... })`.
  - Тело: `body.initData` (обязательная строка).
  - При отсутствии `TELEGRAM_BOT_TOKEN`: 503 и "Telegram auth is unavailable in this environment".
  - При успехе: `verifyTelegramInitData` → `roomLifecycle.upsertAuthenticatedUser(user)` → `authSessions.issue(user)` → ответ `{ token, user }`.
  - При ошибке валидации: 401 и сообщение из ошибки.

**Файлы:** `apps/server/src/app.ts` (строки 36, 334–377).

---

### 1.4 Валидация Telegram initData на backend

- **Где:** `apps/server/src/auth/verifyTelegramInitData.ts`
  - Парсинг `initData` как URLSearchParams: `hash`, `auth_date`, `user`.
  - Проверка срока: `auth_date` + `ttlSeconds` (по умолчанию 3600 с).
  - Проверка подписи: HMAC-SHA256 с ключом `createHmac("sha256", "WebAppData").update(botToken).digest()`, data-check-string по правилам Telegram, сравнение через `timingSafeEqual`.
  - Из `user` собирается `TelegramUserIdentity` (telegramUserId, username, firstName, lastName, photoUrl, displayName).
  - Используется `TELEGRAM_BOT_TOKEN` из конфига (передаётся в `buildApp` как `telegramBotToken`).

**Файлы:** `apps/server/src/auth/verifyTelegramInitData.ts`, `apps/server/src/config.ts` (TELEGRAM_BOT_TOKEN, TELEGRAM_INITDATA_TTL_SECONDS).

---

### 1.5 Связь auth/session с WebSocket

- **Выдача сессии:** После успешной проверки initData вызывается `authSessions.issue(user)` (`apps/server/src/auth/sessionStore.ts`). Сессия хранится в памяти (Map), содержит `token`, `user`, `issuedAt`, `expiresAt`.
- **Клиент:** Полученный `token` сохраняется в `sessionStorage` (AUTH_STORAGE_KEY) и в `snapshot.authToken`. При создании/входе в комнату и реконнекте вызывается `ensureAuthenticated()` → затем `connect(token)`.
- **WebSocket auth:** Клиент подключается с протоколами `createWsClientProtocols(authToken)` из `@durak/shared`: `["durak.v1", "auth.<token>"]`. Сервер читает заголовок `Sec-WebSocket-Protocol`, извлекает токен через `extractAuthTokenFromSubprotocolHeader` (`apps/server/src/auth/wsAuth.ts`), проверяет через `authSessions.verify(authToken)`. При невалидном/просроченном токене соединение закрывается с 4401 "Unauthorized".
- **Единая модель:** Один и тот же токен используется и для HTTP (ответ /auth/telegram), и для WS; одна и та же сессия (AuthSessionStore) обслуживает оба канала.

**Файлы:**  
- Сервер: `apps/server/src/auth/sessionStore.ts`, `apps/server/src/auth/wsAuth.ts`, `apps/server/src/app.ts` (GET /ws, строки 421–491).  
- Клиент: `apps/web/src/net/gameSessionStore.ts` (ensureAuthenticated, connect, createRoom, joinRoom, attemptReconnect), `apps/web/src/net/wsClient.ts`, `packages/shared/src/models/wsProtocol.ts`.

---

### 1.6 Room create/join flow

- **Клиент:** `createRoom(playerName)` и `joinRoom(roomId, playerName)` в `gameSessionStore.ts`:
  1. `await this.ensureAuthenticated(playerName, true)` (при необходимости POST /auth/telegram или /auth/dev).
  2. `this.connect(token)` — открытие WebSocket с `createWsClientProtocols(token)` и URL из `getWebSocketUrl(token)`.
  3. `this.sendMessage({ type: "room.create" })` или `{ type: "room.join", roomId }`.
- **Сервер:** В обработчике WebSocket по типу сообщения: `room.create` → `registry.createRoom()`, `createHost(authenticatedUser, ...)`; `room.join` → `registry.getRoom(data.roomId)`, добавление игрока. Игрок привязан к `authenticatedUser` из верифицированной сессии.

**Файлы:** `apps/web/src/net/gameSessionStore.ts` (createRoom, joinRoom, sendMessage, обработка room.created/room.joined), `apps/server/src/app.ts` (switch по data.type в socket.on("message")).

---

### 1.7 URL и env для API/WS и Mini App

- **Клиент (production):**  
  - `apps/web/src/net/runtimeConfig.ts`: `getApiBaseUrl()` — `VITE_API_BASE_URL` || `VITE_SERVER_ORIGIN` || `window.location.origin`; `getWebSocketUrl(authToken)` — `VITE_WS_URL` || `VITE_WS_BASE_URL` + `/ws` || из `VITE_SERVER_ORIGIN` (wss) || текущий origin. В production query `?token=` не добавляется.
  - В `gameSessionStore` URL для auth: `getApiUrl(AUTH_TELEGRAM_PATH)` = `getApiBaseUrl() + "/auth/telegram"`.
- **Клиент (dev):** В dev используется `VITE_API_BASE_URL` / `VITE_WS_BASE_URL` (по умолчанию http://127.0.0.1:8080 и ws://127.0.0.1:8080); при наличии токена к URL WS добавляется `?token=...` для dev fallback на сервере.
- **Mini App / Telegram:** В `apps/web/src/lib/telegram.ts` заданы геттеры из env: `getConfiguredTelegramMiniAppUrl()` (VITE_TELEGRAM_MINI_APP_URL), `getConfiguredTelegramBotUsername()` (VITE_TELEGRAM_BOT_USERNAME), `getConfiguredTelegramMiniAppShortName()` (VITE_TELEGRAM_MINI_APP_SHORT_NAME). В `.env.example` для production указаны примеры (VITE_TELEGRAM_MINI_APP_URL, VITE_TELEGRAM_BOT_USERNAME, VITE_TELEGRAM_MINI_APP_SHORT_NAME).
- **Сервер:** `apps/server/src/config.ts` — TELEGRAM_BOT_TOKEN, TELEGRAM_INITDATA_TTL_SECONDS, CORS_ALLOWED_ORIGINS, PUBLIC_WEB_APP_URL (добавляется в CORS при наличии).

**Файлы:** `apps/web/src/net/runtimeConfig.ts`, `apps/web/src/lib/telegram.ts`, `apps/web/.env.example`, `apps/server/src/config.ts`, `apps/server/.env.example`.

---

## 2. Что реализовано частично

### 2.1 Dev-auth и комментарии в коде

- Комментарии в `gameSessionStore` по-прежнему упоминают в первую очередь «dev bootstrap» и «/auth/dev» (например, «Dev bootstrap order: (1) call /auth/dev...»). Логика при этом корректная: при наличии initData используется /auth/telegram, при отсутствии и `isLocalDevAuthEnabled()` — /auth/dev. То есть реализация полная, формулировки ориентированы на dev.
- **Рекомендация:** Обновить комментарии, явно указав приоритет: «(1) при initData → POST /auth/telegram, иначе при dev → POST /auth/dev».

### 2.2 Mini App URL для приглашений в комнату

- `getConfiguredTelegramMiniAppUrl()`, `getTelegramStartParam()` есть, но **нет генерации ссылки вида** `https://t.me/BotUsername?startapp=ROOM_ID` для шаринга комнаты и **нет обработки start_param при открытии** (автовход в комнату по ссылке).
- То есть запуск по прямой ссылке на Mini App реализован; «запуск по ссылке с кодом комнаты» — нет.

### 2.3 Локальный dev: WebSocket auth через query

- Сервер в dev при `allowDevAuth` и отсутствии токена в `Sec-WebSocket-Protocol` пытается взять токен из query (`?token=...`). URL для парсинга берётся из `wsFullUrlByRequest.get(request)` или `request.raw?.url` / `request.url`.
- В части окружений (например, Fastify/Node) при upgrade запросе сохранённый URL с query может быть недоступен в обработчике WebSocket (другой объект request или заголовки не пробрасываются), из-за чего query fallback не срабатывает и комната не создаётся в локальном dev. Production при этом рассчитан только на auth через протокол.

---

## 3. Что может ломать запуск через Telegram

### 3.1 Конфигурация (наиболее вероятно)

- **Сервер без TELEGRAM_BOT_TOKEN:** В production `apps/server/src/index.ts` требует `config.telegramBotToken || config.allowDevAuth`; при APP_ENV=production обычно allowDevAuth=false, значит нужен TELEGRAM_BOT_TOKEN. Без него сервер не стартует. Для POST /auth/telegram при отсутствии токена возвращается 503.
- **CORS:** Origin Mini App (HTTPS URL, с которого открывается приложение) должен входить в CORS_ALLOWED_ORIGINS (или быть добавлен через PUBLIC_WEB_APP_URL). Иначе браузер блокирует POST /auth/telegram и/или WebSocket.
- **Клиент:** В production-сборке должны быть заданы VITE_SERVER_ORIGIN и/или VITE_WS_URL (или VITE_API_BASE_URL, VITE_WS_BASE_URL) так, чтобы запросы шли на реальный backend. Иначе auth и WS идут не туда или на старый origin.

### 3.2 WebSocket в Telegram WebView

- В production авторизация WS только через `Sec-WebSocket-Protocol`. Стандартный WebSocket API в браузере/WebView передаёт второй аргумент `protocols` в заголовок. Если в каком-то клиенте Telegram (старая версия/платформа) заголовок обрезается или не отправляется, соединение будет отклонено. На текущий момент это гипотетический риск; при проблемах можно рассмотреть отдельный production-safe канал передачи токена (например, только для известных клиентов).

### 3.3 initData недоступен

- Если пользователь откроет приложение не из Telegram (прямая ссылка в браузере), `initData` будет пустым. В production dev-auth отключён — будет ошибка «Open the app from Telegram (menu or bot link) to play» (или аналогичная). Это ожидаемое поведение, а не поломка flow.

### 3.4 Истечение initData

- На backend проверяется TTL (по умолчанию 1 час). Если пользователь долго не нажимал «Создать комнату» и initData устарел, POST /auth/telegram вернёт 401. Клиент может повторно запросить данные только при новом открытии Mini App; автоматического refresh initData в коде нет.

---

## 4. Файлы, участвующие в Telegram auth flow

| Роль | Файл |
|------|------|
| Подключение SDK | `apps/web/index.html` |
| Инициализация WebApp (ready, expand, theme) | `apps/web/src/App.tsx` |
| Доступ к Telegram (getTg, initData, initDataUnsafe) | `apps/web/src/lib/telegram.ts` |
| Выбор auth (initData vs dev), вызов API, сохранение токена | `apps/web/src/net/gameSessionStore.ts` |
| URL API/WS | `apps/web/src/net/runtimeConfig.ts` |
| Dev vs production (isLocalDevAuthEnabled) | `apps/web/src/lib/runtimeEnv.ts` |
| WebSocket клиент (connect с protocols) | `apps/web/src/net/wsClient.ts` |
| Протоколы WS (createWsClientProtocols) | `packages/shared/src/models/wsProtocol.ts` |
| POST /auth/telegram, POST /auth/dev, GET /ws | `apps/server/src/app.ts` |
| Валидация initData | `apps/server/src/auth/verifyTelegramInitData.ts` |
| Извлечение токена из Sec-WebSocket-Protocol | `apps/server/src/auth/wsAuth.ts` |
| Хранение и верификация сессий | `apps/server/src/auth/sessionStore.ts` |
| Типы пользователя/сессии | `apps/server/src/auth/types.ts` (и связанные) |
| Конфиг сервера (TELEGRAM_BOT_TOKEN, CORS, allowDevAuth) | `apps/server/src/config.ts` |
| Запуск сервера (проверка TELEGRAM_BOT_TOKEN) | `apps/server/src/index.ts` |
| Env примеры | `apps/web/.env.example`, `apps/server/.env.example` |

---

## Краткое резюме

- **Реализовано полностью:** инициализация Telegram WebApp SDK, чтение initData и initDataUnsafe, endpoint POST /auth/telegram, валидация initData (подпись + TTL) с TELEGRAM_BOT_TOKEN, единая auth/session модель и привязка к WebSocket через Sec-WebSocket-Protocol, flow создания/входа в комнату и старта игры, разделение dev/production и env для API/WS/Mini App.
- **Частично:** комментарии заточены под dev-auth; нет генерации/обработки Mini App URL с start_param для приглашения в комнату; в локальном dev в некоторых средах WebSocket auth через query может не работать.
- **Что может ломать запуск в Telegram:** отсутствие или неверный TELEGRAM_BOT_TOKEN, неверный CORS, неверные URL на клиенте в production, теоретически — особенности WebView с Sec-WebSocket-Protocol, отсутствие initData при открытии не из Telegram или истёкший initData.
