# Verification

## Part 7 — Verify locally (expected sequence)

При локальной проверке (Mini App открыт или локальный фронт после авторизации) ожидается такая последовательность:

| # | Шаг | Где проверить |
|---|-----|----------------|
| 1 | Mini App открывается | Браузер: загружается экран лобби или «Connecting to server» до авторизации. |
| 2 | **POST /auth/telegram** → 200 (или **POST /auth/dev** в dev) | Network: запрос с телом `{ initData }` или `{ playerName, clientId }`; ответ 200, в теле `token` и `user`. |
| 3 | **GET /ws?token=...** (или Sec-WebSocket-Protocol с токеном) | Network: запрос на `/ws`, статус 101 Switching Protocols. В dev возможен query fallback. |
| 4 | Backend: «token validated» | Логи сервера (dev): `ws token extracted` → `ws token validated`. |
| 5 | Backend: «websocket client registered» | Логи сервера (dev): `ws session/user resolved` → `websocket auth success` → `ws client registered`. |
| 6 | Backend: отправлено начальное событие ready | Логи сервера (dev): `initial server event sent` (сразу после `ws client registered`). |
| 7 | Фронт выходит из «Connecting to server» | UI: после открытия WS и получения `connection.ready` показывается лобби (кнопки «Создать комнату» / «Войти в комнату»). |
| 8 | Лобби / создание комнаты доступно | Можно нажать «Создать комнату» или ввести код и «Войти в комнату» без бесконечного спиннера и без ошибки WebSocket. |

**Как проверить локально:**

1. Запустить сервер: `pnpm --filter ./apps/server dev` — в консоли: `Server listening at http://127.0.0.1:8080`.
2. Запустить фронт: `pnpm --filter ./apps/web dev` — открыть http://localhost:5173.
3. В браузере: ввести имя → «Создать комнату» (или эквивалент). В Network: POST `/auth/dev` 200, затем GET `/ws` 101. В логах сервера: token validated → ws client registered → initial server event sent.
4. Автоматическая проверка (сервер уже запущен): `pnpm verify:local` — health, auth/dev, WS open, первое сообщение `connection.ready`, room.create → room.created, второй клиент join.

---

## Part 11 — Definition of Done

**Задача считается выполненной только если выполнены все пункты ниже.** Если хотя бы один не выполнен — задача не завершена.

| # | Критерий | Как проверить |
|---|----------|----------------|
| 1 | Приложение реально открывается через Telegram Mini App | Открыть бота в Telegram → кнопка/ссылка Mini App → загружается ваш фронтенд (HTTPS). |
| 2 | `initData` реально приходит с клиента | В консоли (dev) при открытии из Telegram: «initData received»; запрос POST `/auth/telegram` уходит с телом `{ initData }`. |
| 3 | Backend реально валидирует Telegram auth | В логах сервера: «Telegram auth request received» → «Telegram auth success» с `telegramUserId`; ответ 200 и `token` + `user`. |
| 4 | Фронтенд получает валидную session/auth модель | После успешного POST `/auth/telegram`: в хранилище есть сессия с `token` и `user`; UI не показывает ошибку авторизации. |
| 5 | WebSocket подключается уже авторизованно | Клиент передаёт токен в Sec-WebSocket-Protocol; в логах сервера «websocket auth source» (protocol), «websocket auth success»; нет «websocket auth fail». |
| 6 | Create room работает | Пользователь нажимает «Создать комнату» → видит экран ожидания и код комнаты; сервер логирует «room create». |
| 7 | Join room работает | Второй пользователь вводит код и нажимает «Войти в комнату» → попадает в ту же комнату; сервер логирует «room join». |
| 8 | Два клиента через Telegram могут войти в одну комнату | Два разных аккаунта/устройства открывают Mini App, один создаёт комнату, второй входит по коду — оба видят один список игроков и один код комнаты. |
| 9 | Старт игры работает | Хост нажимает «Старт» (режим) → оба клиента переходят в игру; сервер логирует «room start» / «game start». |
| 10 | Первый игровой сетевой цикл работает | Ход (атака/защита/подкидывание и т.д.) выполняется на одном клиенте и синхронизируется на другом через `room.state`. |
| 11 | Нет блокирующих ошибок «WebSocket connection error» | В UI и консоли нет сообщения о ошибке подключения WebSocket, блокирующего создание/вход в комнату или игру. |
| 12 | Нет серверных `500` на websocket handshake | При открытии WS сервер возвращает успешный апгрейд (101); в логах нет 500 при запросе на `/ws`. |

Проверка по пунктам 1–10 выполняется **через реальный запуск из Telegram** (публичный HTTPS). Пункты 11–12 проверяются по консоли браузера и логам сервера.

---

## Part 9 — Полная проверка после переписывания

Проверка выполняется **самостоятельно** (или автоматически где возможно): сборка, локальный запуск, публичный запуск через Telegram, игровой сценарий.

### A. Сборка

Должно работать без ошибок:

```bash
pnpm install
pnpm build
```

### B. Локальный запуск

**Сервер:**

```bash
pnpm --filter ./apps/server dev
```

В консоли должно появиться: `Server listening at http://127.0.0.1:8080` (или другой порт из `apps/server/.env`).

**Фронтенд** (в другом терминале):

```bash
pnpm --filter ./apps/web dev
```

Приложение доступно по адресу **http://localhost:5173**.

**Автоматическая проверка бэкенда** (при запущенном сервере):

```bash
pnpm verify:local
```

Скрипт проверяет: `/health`, POST `/auth/dev`, WebSocket `/ws` с токеном, `room.create` → `room.created`, второй клиент: auth + `room.join` → `room.joined`, совпадение `roomId`.

### C. Публичный запуск через Telegram

Проверить вручную:

| # | Проверка | Как убедиться |
|---|----------|----------------|
| 1 | Публичный HTTPS URL доступен | Сайт Mini App открывается по HTTPS (например, VITE_SERVER_ORIGIN / PUBLIC_WEB_APP_URL). |
| 2 | Telegram открывает Mini App | Открыть бота в Telegram, нажать кнопку/ссылку Mini App — открывается ваш фронтенд. |
| 3 | Frontend получает `initData` | В консоли (dev) при открытии из Telegram: лог «initData received»; без Telegram — «initData missing». |
| 4 | Backend валидирует Telegram auth | После действия (создать/войти в комнату): в логах сервера «Telegram auth request received» → «Telegram auth success» с `telegramUserId`. |
| 5 | WebSocket подключается авторизованно | В логах сервера: «websocket auth source» (protocol), «websocket auth success». Нет «websocket auth fail». |

Для продакшена нужны: `TELEGRAM_BOT_TOKEN` на сервере, фронт собран с нужным `VITE_SERVER_ORIGIN` / `VITE_TELEGRAM_MINI_APP_URL`, CORS и прокси настроены так, чтобы запросы к API/WS шли на тот же домен или разрешённый origin.

### D. Игровой flow

Проверить вручную (два пользователя — два устройства или два браузера/профиля):

| # | Шаг | Ожидание |
|---|-----|----------|
| 1 | Первый пользователь открывает Mini App | Лобби, кнопка «Создать комнату». |
| 2 | Создаёт комнату | Комната создана, виден код комнаты, экран ожидания игроков. |
| 3 | Второй пользователь открывает Mini App | Лобби. |
| 4 | Входит в комнату по коду | Ввод кода, «Войти в комнату» → попадает в ту же комнату. |
| 5 | Оба видят одно состояние комнаты | У обоих один и тот же список игроков и код комнаты. |
| 6 | Можно стартовать игру | Хост нажимает «Старт» (режим) → оба переходят в игру. |
| 7 | Первый сетевой игровой цикл | Ход (атака/защита и т.д.) синхронизируется между клиентами через `room.state`. |

При проблемах: смотреть логи сервера (room create/join, game start, websocket auth) и консоль браузера (auth, WS connect, room create request started/failed).

---

## Local verification (кратко)

## Expected result (manual test in browser)

When you run the app locally and click **Create room**:

1. **Enter name** in the input.
2. Click **Create room**.
3. **POST /auth/dev** succeeds (check Network tab or server logs).
4. **Authenticated /ws** connection succeeds (no 500 on handshake).
5. **No "WebSocket connection error"** in the UI or console.
6. **Room create works**: you see the room / lobby (e.g. room created, waiting for players).

## How to run

1. **Start server + web** (from repo root):
   ```bash
   pnpm dev
   ```
   - Server: http://127.0.0.1:8080 (ensure `APP_ENV=development` so `/auth/dev` is enabled).
   - Web: http://localhost:5173.

2. **Open** http://localhost:5173 in the browser.

3. **Verify**: Enter a name → click **Create room** → confirm no WebSocket error and room appears.

## Automated verification

With the server already running (e.g. `pnpm dev`):

```bash
pnpm verify:local
```

This script:

- Hits `/health`, POST `/auth/dev`, connects to `/ws` with auth protocol, sends `room.create`, asserts `room.created`.
- Runs a second client: auth + connect + join same room, asserts `room.joined`.

Requires server on **http://127.0.0.1:8080** with **APP_ENV=development**.
