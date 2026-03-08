# Запуск Mini App через Telegram (production)

Цель: приложение открывается **внутри Telegram**, игрок авторизуется через Telegram, WebSocket с авторизацией работает, доступны создание/вход в комнату, старт игры и игровой цикл.

---

## Цепочка запуска (9 шагов)

| # | Шаг | Где реализовано |
|---|-----|-----------------|
| 1 | Пользователь открывает Mini App внутри Telegram | Telegram (кнопка меню / ссылка бота) → WebView загружает ваш HTTPS URL |
| 2 | Фронтенд получает `Telegram.WebApp.initData` | `index.html` подключает `telegram-web-app.js`; `getTelegramInitData()` в `apps/web/src/lib/telegram.ts` возвращает `window.Telegram?.WebApp?.initData` |
| 3 | Фронтенд отправляет `initData` на backend | `ensureAuthenticated()` в `apps/web/src/net/gameSessionStore.ts` → POST `getApiUrl(AUTH_TELEGRAM_PATH)` с телом `{ initData }` |
| 4 | Backend валидирует `initData` с использованием `TELEGRAM_BOT_TOKEN` | POST `/auth/telegram` в `apps/server/src/app.ts` → `verifyTelegramInitData(initData, { botToken, ttlSeconds })` в `apps/server/src/auth/verifyTelegramInitData.ts` |
| 5 | Backend создаёт доверенную auth/session модель игрока | После успешной проверки: `roomLifecycle.upsertAuthenticatedUser(user)`, `authSessions.issue(user)`; ответ `{ token, user }` |
| 6 | Фронтенд получает auth/session/token | В `ensureAuthenticated()`: `saveSessionJson(AUTH_STORAGE_KEY, payload)`, `setSnapshot({ authToken: payload.token })` |
| 7 | Фронтенд открывает **авторизованный** WebSocket | `connect(token)` → `new WebSocket(getWebSocketUrl(token), createWsClientProtocols(token))` в `apps/web/src/net/wsClient.ts`; в production токен только в `Sec-WebSocket-Protocol` |
| 8 | Игрок может создать комнату / войти в комнату | `createRoom()` / `joinRoom()` вызывают `ensureAuthenticated()` → `connect(token)` → `sendMessage({ type: "room.create" })` или `room.join` |
| 9 | Игра реально запускается | Сервер обрабатывает `room.start`, рассылает `room.started` и игровое состояние; клиент переходит в сцену игры |

В production dev-auth отключён: авторизация только через POST `/auth/telegram`, WebSocket — только через `Sec-WebSocket-Protocol`.

**Единый контракт передачи auth в /ws:** см. **WS-AUTH-CONTRACT.md** (только `Sec-WebSocket-Protocol`; query/cookie не используются в production).

---

## Room flow (Telegram auth)

- **Создание комнаты** и **вход в комнату** идут через реальный backend: клиент отправляет по WebSocket `room.create` или `room.join` (с `roomId` для входа); сервер создаёт комнату в `RoomRegistry` или находит её по id и добавляет игрока.
- **Идентичность игрока** берётся только из Telegram-authenticated сессии: при GET /ws токен верифицируется, `authenticatedUser = authSession.user`; при `room.create` и `room.join` используется именно этот `authenticatedUser`. Клиент не передаёт в сообщениях ни `userId`, ни `playerId`, ни данные пользователя.
- **room id** и **player id** задаются на сервере (`RoomRegistry.createRoom()` генерирует id комнаты; `GameRoom.createMember()` — id игрока). Клиент не может подделать room/player id: комната ищется в реестре по переданному id (для join), а playerId возвращается в ответах `room.created` / `room.joined`.
- В серверных логах при успешном flow видны: **Telegram auth success** (POST /auth/telegram), **ws connect** (GET /ws после верификации токена), **room create** / **room join** (обработка сообщений), **room start** (старт матча).

---

- Mini App открывается **внутри Telegram** (по ссылке от бота или меню).
- **Telegram `initData`** приходит на клиент (его подставляет Telegram WebView в `window.Telegram.WebApp.initData`).
- Backend **валидирует `initData`** (подпись + TTL) и выдаёт сессионный токен.
- Игрок авторизуется **только через Telegram** (POST `/auth/telegram`); dev-auth в production отключён.
- Клиент устанавливает **авторизованное WebSocket-соединение** (токен передаётся в `Sec-WebSocket-Protocol`).
- Доступны: создание комнаты, вход в комнату, список игроков, старт игры, первый игровой цикл.

Локальный dev-only bootstrap (POST `/auth/dev`, опциональный query-параметр для WS) **не используется** в production и не должен ломать Telegram flow.

---

## 2. Цепочка на клиенте (production)

1. **Загрузка в Telegram WebView**  
   Подключается `telegram-web-app.js` (уже в `index.html`). Telegram выставляет `window.Telegram.WebApp` и при открытии Mini App заполняет `initData`.

2. **Получение initData**  
   В коде: `getTelegramInitData()` из `apps/web/src/lib/telegram.ts` — возвращает `window.Telegram?.WebApp?.initData` или `null`. Если приложение открыто как Mini App, `initData` есть.

3. **Авторизация**  
   При первом действии (создать комнату / войти в комнату) вызывается `ensureAuthenticated()`.  
   - Если есть `initData` → **POST `/auth/telegram`** с телом `{ initData }`.  
   - Dev-auth (POST `/auth/dev`) вызывается **только** при `isLocalDevAuthEnabled()` (Vite dev + `VITE_APP_ENV=development`), в production-сборке не используется.

4. **Ответ бэкенда**  
   Успешный ответ: `{ token, user }`. Токен сохраняется в `sessionStorage` и в состоянии (`authToken`).

5. **WebSocket**  
   - URL берётся из `getWebSocketUrl(token)`. В production **query-параметр с токеном не добавляется** (только в dev).  
   - Подключение: `new WebSocket(url, createWsClientProtocols(token))` → в handshake уходит `Sec-WebSocket-Protocol` с подпротоколом `auth.<token>`.  
   - Бэкенд в production принимает авторизацию **только из Sec-WebSocket-Protocol**; query fallback только в dev.

6. **Дальнейшие действия**  
   По установленному WebSocket отправляются сообщения: `room.create`, `room.join`, `room.start` и т.д.; приходят события комнаты и игры.

---

## 3. Цепочка на бэкенде (production)

1. **POST `/auth/telegram`**  
   - Тело: `{ initData: string }`.  
   - Проверка: `verifyTelegramInitData(initData, { botToken: TELEGRAM_BOT_TOKEN, ttlSeconds })` — проверка подписи и срока действия.  
   - При успехе: создаётся сессия, возвращается `{ token, user }`.

2. **GET `/ws` (WebSocket upgrade)**  
   - Авторизация **только** из заголовка `Sec-WebSocket-Protocol`: из подпротокола вида `auth.<token>` извлекается токен.  
   - В production **не** используется query `?token=...` (это только dev fallback при пустых заголовках).  
   - Токен проверяется через `authSessions.verify(authToken)`; при невалидном/просроченном соединение закрывается.

3. **Игровая логика**  
   Сообщения по WebSocket обрабатываются как раньше: создание/вход в комнату, старт игры, ходы и т.д.

---

## 4. Конфигурация для production

Подробно: **ENV-AND-URLS.md** (согласование URL, HTTPS, BotFather, CORS).

### Сервер (backend)

- **APP_ENV=production**  
- **TELEGRAM_BOT_TOKEN** — обязателен (без него POST `/auth/telegram` вернёт 503).  
- **ALLOW_DEV_AUTH** — не устанавливать или `false` (POST `/auth/dev` в production возвращает 404).  
- **CORS**: в `CORS_ALLOWED_ORIGINS` должен быть URL Mini App (например `https://your-app.pages.dev`).  
- **PUBLIC_WEB_APP_URL** — URL Mini App (по желанию, для CORS и документации).  
- **TRUST_PROXY** — обычно `true` за reverse proxy.

### Клиент (frontend build)

- Сборка без dev-режима (`import.meta.env.DEV === false`), чтобы не использовались dev-auth и query-токен в URL.  
- Нужно задать, куда стучаться API/WS (тот же хост или отдельный backend):
  - **VITE_SERVER_ORIGIN** — origin бэкенда (например `https://api.example.com`); по нему выводятся API и WS URL.  
  - или **VITE_WS_URL** / **VITE_WS_BASE_URL** / **VITE_API_BASE_URL** при другой схеме раздачи.  
- **VITE_APP_ENV=production** при сборке — чтобы `isLocalDevAuthEnabled()` был false.

Пример переменных для production-сборки см. в **apps/web/.env.example**.

### Telegram (BotFather + Mini App)

Пошаговая настройка: **TELEGRAM-BOTFATHER-SETUP.md** (что настроить в BotFather, как задать Web App URL, как открыть Mini App, как проверить initData).

Кратко:
1. Создать бота через BotFather, получить токен → **TELEGRAM_BOT_TOKEN**.
2. В настройках бота задать **Menu Button** (Web App URL) — HTTPS на развёрнутый фронт (тот же, что в CORS).
3. При открытии из Telegram в WebView подставляется `initData`.

---

## 5. Проверка flow в production

1. Открыть Mini App из Telegram (кнопка меню или ссылка).  
2. В консоли/логах убедиться, что есть `initData` (например, при первом запросе на создание комнаты).  
3. В Network: POST `/auth/telegram` → 200, в ответе `token` и `user`.  
4. В Network: запрос на upgrade к `/ws` с заголовком `Sec-WebSocket-Protocol` (значение содержит подпротокол с токеном).  
5. Создать комнату, войти в комнату, стартовать игру, сделать ход — без ошибок авторизации и без «WebSocket connection error» из-за отсутствия токена.

---

## 6. Локальный dev и изоляция от production

- **Dev:**  
  - `APP_ENV=development`, опционально `ALLOW_DEV_AUTH=true`.  
  - Доступны POST `/auth/dev` и (на сервере) fallback чтения токена из query для WS, если заголовок протокола пустой.  
  - Клиент в dev может не иметь `initData`; тогда используется dev-auth и при необходимости query в URL для WS.

- **Production:**  
  - `APP_ENV=production`, без dev-auth.  
  - Только POST `/auth/telegram` и авторизация WS через **Sec-WebSocket-Protocol**.  
  - Query-параметр для токена в production не используется и не проверяется.

Таким образом, приложение доводится до состояния, при котором оно **реально запускается через Telegram Mini Apps**, с корректной авторизацией и WebSocket, а локальный dev-only bootstrap production flow не ломает.

---

## 7. Чеклист перед запуском в Telegram

- [ ] Бот создан в BotFather, токен прописан в `TELEGRAM_BOT_TOKEN` на сервере.
- [ ] Backend развёрнут с `APP_ENV=production`, без `ALLOW_DEV_AUTH`.
- [ ] Frontend собран с `VITE_APP_ENV=production` и заданными `VITE_SERVER_ORIGIN` / `VITE_WS_URL` (или аналогами).
- [ ] URL Mini App (HTTPS) прописан в настройках бота (Menu Button / Web App).
- [ ] В CORS на сервере указан origin Mini App.
- [ ] В Telegram открыта ссылка на Mini App — в консоли есть `initData`, POST `/auth/telegram` возвращает 200, WebSocket поднимается с `Sec-WebSocket-Protocol`.
