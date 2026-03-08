# Часть 12 — Итоговый отчёт (Cursor)

Краткий отчёт о состоянии проекта после выполнения задачи (логи, верификация, Definition of Done, область переписок).

---

## 1. Что именно было сломано

В рамках текущей сессии **критичных поломок не вносилось**. Выполнялись:

- **Часть 8:** добавление структурированных dev-логов (backend и frontend) без изменения бизнес-логики.
- **Часть 9:** проверка сборки и локального запуска (`pnpm install`, `pnpm build`, `pnpm verify:local`), уточнение чеклистов для Telegram и игрового сценария.
- **Часть 10–11:** документирование допустимой области переписок и Definition of Done.

Если до этого что-то было сломано (например, после более раннего переписывания), то на момент отчёта:

- Сборка и тесты проходят.
- Локальная верификация `pnpm verify:local` проходит при запущенном сервере.
- Production-путь: только POST `/auth/telegram` с валидацией `initData`; dev-путь (POST `/auth/dev`, query-token для WS) включён только при `APP_ENV=development`.

---

## 2. Какие файлы были изменены

**Backend:**

- `apps/server/src/app.ts` — логи: Telegram auth request/success/fail, user id после валидации, websocket auth source/success/fail, room create/join, game start (без секретов и полного bot token).
- `apps/server/src/index.ts` — вывод в консоль адреса после `app.listen()` для проверки запуска.

**Frontend:**

- `apps/web/src/net/gameSessionStore.ts` — dev-логи: Telegram SDK detected/not detected, initData received/missing, Telegram auth request started/success/fail, websocket connect attempt after auth, room create request started/failed (без токенов и сырого initData).

**Документация:**

- `VERIFICATION.md` — Part 9 (сборка, локальный запуск, чеклисты C/D), Part 11 (Definition of Done), существующие разделы local verification.
- `docs/REWRITE-SCOPE.md` — Часть 10: что разрешено переписывать, что запрещено.
- `docs/AI_HANDOFF.md` — добавлен `docs/REWRITE-SCOPE.md` в минимальный пакет контекста.
- `docs/FINAL-REPORT.md` — этот отчёт (Часть 12).

---

## 3. Как теперь устроен Telegram auth flow

1. **Открытие Mini App в Telegram**  
   Telegram подгружает фронтенд по публичному HTTPS URL. В контексте доступен `window.Telegram.WebApp` и `Telegram.WebApp.initData` (строка с подписанными данными).

2. **Bootstrap на фронте**  
   При необходимости авторизации (например, перед созданием/входом в комнату) вызывается `startTelegramBootstrap()` или `ensureAuthenticated()`. Если есть `getTelegramInitData()` — запрос идёт на POST `/auth/telegram` с телом `{ initData }`. Если нет initData и включён локальный dev — POST `/auth/dev` с `{ playerName, clientId }`.

3. **Backend (production)**  
   POST `/auth/telegram`: проверка `initData` через `verifyTelegramInitData(initData, { botToken: TELEGRAM_BOT_TOKEN, ttlSeconds })` (подпись HMAC-SHA256 и TTL). При успехе — создаётся сессия в `AuthSessionStore`, возвращается `{ token, user }`. Identity берётся только из результата верификации, не из тела запроса.

4. **Фронт после успешного auth**  
   Ответ сохраняется в sessionStorage (ключ `durak.auth-session`), в состоянии — `authToken` и данные пользователя. WebSocket до этого не открывается; при следующем `connect(token)` используется этот токен.

5. **Порядок**  
   Auth bootstrap → получение токена → только затем вызов `connect(token)` и отправка `room.create` / `room.join`.

---

## 4. Как auth передаётся в WebSocket

- **Единый механизм (production и dev):** токен передаётся в **заголовке `Sec-WebSocket-Protocol`** при handshake.
- **Клиент:** `createWsClientProtocols(token)` из `@durak/shared` возвращает `["durak.v1", "auth.<token>"]`. При вызове `connect(token)` в `gameSessionStore` передаётся `getWebSocketUrl(token)` и эти протоколы в `new WebSocket(url, protocols)`.
- **Сервер:** в обработчике GET `/ws` читается заголовок `sec-websocket-protocol`, из него вызывается `extractAuthTokenFromSubprotocolHeader()` (поиск подстроки с префиксом `auth.`), затем `authSessions.verify(token)`. При невалидном/отсутствующем токене соединение закрывается с ошибкой (без 500).
- **Dev fallback:** только при `APP_ENV=development` и `allowDevAuth` сервер дополнительно смотрит query-параметр `?token=...`, если в заголовке протокола токена нет. В production query не используется.
- Подробности: `WS-AUTH-CONTRACT.md` в корне репозитория.

---

## 5. Какой публичный URL используется для Mini App

- **Задание URL при сборке фронта:** переменная **`VITE_TELEGRAM_MINI_APP_URL`** — полный HTTPS URL Mini App (тот же, что указывается в BotFather в качестве Web App URL). Используется в `getConfiguredTelegramMiniAppUrl()` / `getMiniAppLaunchUrl()` в `apps/web/src/lib/telegram.ts`.
- **Куда ходят API/WS в production:** базовый URL для API и WS задаётся в таком приоритете: **`VITE_API_BASE_URL`** → **`VITE_SERVER_ORIGIN`** → `window.location.origin`. Для WS отдельно можно задать **`VITE_WS_URL`** или **`VITE_WS_BASE_URL`**. Если фронт и бэкенд на одном домене, достаточно не задавать их — будет использоваться origin страницы.
- **Сервер:** при необходимости CORS и публичного URL бэкенд читает `PUBLIC_WEB_APP_URL` и добавляет его в `corsAllowedOrigins`; для своего API может использоваться `PUBLIC_BASE_URL`.

Итого: публичный URL Mini App для Telegram (BotFather) задаётся через **`VITE_TELEGRAM_MINI_APP_URL`** при сборке; тот же домен/путь обычно используется как место раздачи фронта.

---

## 6. Какие команды запуска теперь работают

- **Установка и сборка:**  
  `pnpm install`  
  `pnpm build`  
  Оба выполняются без ошибок.

- **Локальный запуск:**  
  Сервер: `pnpm --filter ./apps/server dev` — в консоли появляется строка вида `Server listening at http://127.0.0.1:8080`.  
  Фронт: `pnpm --filter ./apps/web dev` — приложение доступно на http://localhost:5173.

- **Параллельный запуск сервера и веба:**  
  `pnpm dev` (из корня репозитория).

- **Автоматическая проверка бэкенда (при уже запущенном сервере):**  
  `pnpm verify:local` — проверяет health, POST `/auth/dev`, подключение к `/ws` с токеном, room.create → room.created, второй клиент: auth + room.join → тот же roomId.

- **Тесты и типопроверка:**  
  `pnpm test`  
  `pnpm typecheck`

---

## 7. Как именно проверялся запуск через Telegram

- **По коду:** проверены цепочки: получение `initData` из `Telegram.WebApp.initData`, отправка в POST `/auth/telegram`, валидация на сервере через `verifyTelegramInitData`, выдача сессии, передача токена в Sec-WebSocket-Protocol, обработка GET `/ws`, создание/присоединение к комнате, рассылка room.created/room.joined/room.players/room.started/room.state.
- **Локально:** запуск сервера и веба, выполнение `pnpm verify:local` (auth/dev + WS + create + join).
- **Чеклисты в VERIFICATION.md:** Part 9 (C — публичный HTTPS, открытие из Telegram, initData, логи auth/WS; D — два пользователя, комната, старт, первый цикл) и Part 11 (Definition of Done) задают, что нужно проверить вручную при реальном запуске из Telegram (два устройства/аккаунта, HTTPS, BotFather URL).

Ручная проверка «реально открылось в Telegram, initData пришёл, backend валидировал, WS авторизован, create/join, два клиента в одной комнате, старт, первый ход» выполняется на стороне заказчика/разработчика при развёрнутом публичном окружении.

---

## 8. Работает ли: create room, join room, game start

- **По коду и скрипту verify:local — да.**  
  - **Create room:** клиент после auth вызывает `connect(token)` и отправляет `{ type: "room.create" }`. Сервер создаёт комнату, вызывает `createHost()`, отправляет `room.created` с roomId, sessionToken, playerId. Фронт переводит в экран ожидания.  
  - **Join room:** второй клиент auth, connect, отправляет `{ type: "room.join", roomId }`. Сервер вызывает `room.join()`, отправляет этому клиенту `room.joined`, всем в комнате — `room.players`. Оба видят один список игроков.  
  - **Game start:** хост отправляет `{ type: "room.start", roomId, mode }`. Сервер вызывает `room.start()`, рассылает `room.started` с состоянием игры. Оба переходят в игру; последующие ходы рассылаются через `room.state`.

- **В production через Telegram** это считается выполненным только после успешной ручной проверки по чеклистам в VERIFICATION.md (Part 11): приложение открывается из Telegram, initData приходит, backend валидирует, WS авторизован, create/join, два клиента в одной комнате, старт, первый сетевой цикл без блокирующих ошибок.

---

## 9. Ограничения и блокеры

- **Проверка через реальный Telegram** не выполнялась в рамках сессии Cursor: нужен развёрнутый HTTPS и настройка бота (BotFather, Web App URL). Итоговая приёмка по Part 11 (Definition of Done) делается вручную при открытии Mini App из Telegram и прохождении всех 12 пунктов.

- **Секреты:** в логах не выводятся `TELEGRAM_BOT_TOKEN`, сырой `initData` и полный session token; при добавлении новых логов это ограничение нужно сохранять.

- **Dev vs production:** в production должны быть отключены POST `/auth/dev` и fallback auth по query для WS; это обеспечивается конфигом (`APP_ENV=production` → `allowDevAuth=false`). При развёртывании нужно задать `TELEGRAM_BOT_TOKEN` и при необходимости `PUBLIC_WEB_APP_URL` / `PUBLIC_BASE_URL`, а на фронте — `VITE_TELEGRAM_MINI_APP_URL` и при необходимости `VITE_SERVER_ORIGIN` / `VITE_API_BASE_URL` / `VITE_WS_URL`.

- **Других известных блокеров в коде не зафиксировано.** При появлении проблем — ориентироваться на логи (Part 8), чеклисты в VERIFICATION.md и контракт в WS-AUTH-CONTRACT.md.
