# Production readiness report (Task 3)

Подготовка к реальному Telegram release: healthcheck, crash protection, reconnect, production logs, защита комнат, rate limiting, cleanup.

---

## 1. Изменённые файлы

| Файл | Изменения |
|------|-----------|
| **apps/server/src/app.ts** | GET /health: добавлены `status: "ok"`, `uptime` (ms), `timestamp`; импорт `createRoomRateLimiters`; лимитеры для room.create, room.join, room.start, player.reconnect, action; логи "room cleanup" при удалении пустой комнаты; production-логи для ws disconnect и websocket auth fail; периодический cleanup пустых комнат (setInterval 5 мин, onClose очищает интервал). |
| **apps/server/src/index.ts** | Обработчики `process.on("uncaughtException")` и `process.on("unhandledRejection")`: логирование и при uncaughtException — exit(1) через 1 с. |
| **apps/server/src/rooms/RoomRegistry.ts** | Метод `getRoomIds(): string[]` для итерации по комнатам при cleanup. |
| **apps/server/src/lib/rateLimit.ts** | Новый модуль: класс `RateLimiter` (sliding window), `createRoomRateLimiters()` — лимиты на create (8/мин), join (15/мин), start (10/мин), reconnect (10/мин), action (120/мин). |
| **apps/web/src/net/gameSessionStore.ts** | Обработка ошибки `RATE_LIMITED` в handleMessage; в production логировать "Request failed" / "Connection error" / "Request rate limited" через console.warn. |
| **apps/web/src/net/wsClient.ts** | В production не логировать "WS connected"; при onclose в production логировать только при code !== 1000; onerror в production не спамить (без console.error с объектом). |

---

## 2. Как реализован /health

- **Маршрут:** `GET /health` (без auth).
- **Ответ:** `{ status: "ok", ok: true, service: "durak-server", env, deployPlatform, uptime (ms), uptimeSeconds, timestamp (Date.now()), protocol, websocketPath }`.
- Используется для внешней проверки живости сервера; не зависит от room state.

---

## 3. Crash protection

- **uncaughtException:** в `index.ts` логируем сообщение и stack, через 1 с вызываем `process.exit(1)`.
- **unhandledRejection:** логируем reason, процесс не завершаем.
- **Ошибки в room/action:** все обработчики в `socket.on("message")` обёрнуты в try/catch; при ошибке вызывается `safeReplyWithError(socket, ...)` и логируется "Rejected websocket message"; исключение не пробрасывается — процесс не падает.
- **Невалидный payload:** `JSON.parse(msg.toString())` в try/catch; при исключении отправляется error клиенту, логируется reject — сервер не падает.

---

## 4. Reconnect и отсутствие дублей игроков

- **player.reconnect:** клиент шлёт `player.reconnect` с `roomId` и `sessionToken`; сервер ищет комнату в registry или восстанавливает через `reconnectService.recoverRoomRuntime` и `registry.restoreRoom`, затем `room.reconnect(user, sessionToken, connection)`.
- **GameRoom.reconnect:** находит участника по `sessionTokenHash` и `telegramUserId`; если у участника уже есть другой `connectionId`, старый connection удаляется из `connections` и `connectionToSession`, затем привязывается новый. Таким образом один игрок не создаёт двух слотов в комнате.
- При невалидной/протухшей сессии сервер возвращает ошибку (Room not found / Reconnect session not found); фронт выставляет `lastError` и снимает pending — нет вечного спиннера.

---

## 5. Ограничение запросов (rate limiting)

- **Модуль:** `apps/server/src/lib/rateLimit.ts` — in-memory sliding window по ключу.
- **Ключи:** по `telegramUserId` для create/join/start/reconnect, по `connectionId` для action.
- **Лимиты (за 60 с):** create 8, join 15, start 10, reconnect 10, action 120.
- При превышении: ответ клиенту — error с кодом `RATE_LIMITED` и понятным сообщением; в лог — "room create/join/start/reconnect rate limited" или без лога для action (только ответ). Сервер не блокируется, запрос отклоняется.

---

## 6. Очистка старых/пустых комнат

- **При room.leave:** если после `room.leave(connectionId)` комната пуста (`room.isEmpty()`), вызывается `registry.removeRoom(room.id)` и логируется "room cleanup" с roomId.
- **Периодический cleanup:** каждые 5 минут перебираются `registry.getRoomIds()`, для каждой комнаты проверяется `room.isEmpty()`; пустые удаляются из registry, количество удалённых логируется как "room cleanup" с полем `removed`.
- При закрытии приложения вызывается `app.addHook("onClose", () => clearInterval(cleanupInterval))`, интервал не висит после остановки.
- Активные игры (есть state и участники) не удаляются по таймеру — удаляются только пустые комнаты.

---

## 7. Production logs

- **Backend:** логируются (в т.ч. в production): старт сервера (уже было), Telegram auth success/failed (без initData/токенов), websocket auth success/fail, ws disconnect (connectionId, roomId, closeCode, closeReason), room create/join/leave/start, room cleanup, rate limited, Rejected websocket message. Сырые токены, полный initData и секреты env не логируются.
- **Frontend:** в production не логируются обычные "WS connected" / "WS disconnected" (при code 1000); при ошибках и ненормальном закрытии — console.warn("WS disconnected", code, reason), "Connection error", "Request failed", "Request rate limited", "Auth/request failed".

---

## 8. Безопасное поведение UI при ошибках

- Уже реализовано: таймаут 15 с при "connecting" → переход в "disconnected" с `lastError` (NETWORK_ERROR); при закрытии с 4401/AUTH_* — сообщение «Откройте приложение из Telegram заново»; при любом переходе в disconnected без reconnect выставляется `lastError`, сбрасываются `pendingAction` и `isAuthenticating` — спиннер не крутится бесконечно.
- Добавлена обработка `RATE_LIMITED`: показ сообщения от сервера и сброс pending.
- Пользователь может повторить: кнопка «Повторить» на экране ошибки Telegram bootstrap; в лобби виден `lastError`, можно снова создать/войти в комнату.

---

## 9. Закрытые production risks

- Сервер не падает от необработанных исключений в потоке (uncaughtException) и от необработанных промисов (unhandledRejection).
- Ошибка одного клиента (невалидный message, ошибка в room/action) не роняет процесс — только ответ с ошибкой и лог.
- Healthcheck доступен без auth и подходит для мониторинга.
- Reconnect не создаёт дубликатов игроков за счёт привязки по sessionToken и замены старого connection.
- Спам create/join/start/reconnect/action ограничен rate limiter’ом с мягким reject.
- Пустые комнаты удаляются при leave и по таймеру раз в 5 минут; логируется cleanup.
- В production логи не содержат секретов; фронт не спамит консоль, но оставляет важные предупреждения.

---

## 10. Оставшиеся ограничения

- Rate limiter in-memory: при нескольких инстансах сервера лимиты не разделяются (нужен общий store, например Redis, при горизонтальном масштабировании).
- Cleanup не удаляет «зависшие» комнаты, где все отключились во время игры (members есть, но connections нет) — при желании можно добавить TTL для таких комнат.
- Логи в формате Fastify (JSON); при необходимости можно добавить отдельный формат/транспорт для продакшена.

---

## 11. Проверка сценариев

- **A. Health:** `GET /health` возвращает 200, `status: "ok"`, `uptime`, `timestamp`.
- **B. Auth:** Telegram auth success и fail обрабатываются, в логах нет токенов/initData.
- **C. WebSocket:** успешное подключение; reconnect после разрыва (player.reconnect) без дублей клиента (одна запись на игрока в комнате).
- **D. Room flow:** create room, join room, при выходе всех — room cleanup (логи "room cleanup").
- **E. Flood protection:** при превышении лимита клиент получает error с кодом RATE_LIMITED; сервер не падает, в логе — "rate limited".

Definition of Done выполнена: есть рабочий /health; backend не падает от локальных ошибок клиента; websocket умеет reconnect без дублей; room create/join защищены от спама; пустые комнаты чистятся; UI не зависает в бесконечном подключении; есть понятные production logs.
