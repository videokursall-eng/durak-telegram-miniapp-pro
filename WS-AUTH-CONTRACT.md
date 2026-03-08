# WebSocket auth contract (GET /ws)

Единый контракт для передачи авторизации при установке WebSocket-соединения.

---

## 1. Единый механизм

**Авторизация передаётся только через заголовок `Sec-WebSocket-Protocol`** (подпротоколы при handshake).

- Клиент при создании сокета передаёт второй аргумент `protocols`: массив строк, одна из которых имеет вид **`auth.<token>`**, где `<token>` — сессионный токен, полученный от POST `/auth/telegram` или POST `/auth/dev`.
- Сервер читает заголовок `Sec-WebSocket-Protocol`, находит значение с префиксом `auth.`, извлекает токен и верифицирует его через `authSessions.verify(token)`.
- **Query-параметр** (`?token=...`) **не используется в production** и допускается только в режиме разработки (dev fallback), если заголовок протокола недоступен.
- **Cookie** и другие заголовки для передачи токена **не используются**.

---

## 2. Контракт (backend и frontend)

### Общий контракт (пакет `@durak/shared`)

- **Префикс подпротокола:** `auth.` (константа `WS_AUTH_SUBPROTOCOL_PREFIX`).
- **Версия протокола:** `durak.v1` (константа `WS_PROTOCOL_VERSION`).
- **Клиент:** формирует массив протоколов через **`createWsClientProtocols(authToken)`** → `["durak.v1", "auth.<token>"]`.
- **Сервер:** извлекает токен через **`extractAuthTokenFromSubprotocolHeader(header)`** (ищет значение с префиксом `auth.` и возвращает подстроку после него).

### Frontend

- **Файлы:** `apps/web/src/net/wsClient.ts`, `apps/web/src/net/gameSessionStore.ts`.
- При вызове `connect(token)` передаётся `getWebSocketUrl(token)` и **`createWsClientProtocols(token)`** из `@durak/shared` в `new WebSocket(url, protocols)`.
- В **production** URL не содержит query-параметров с токеном (`getWebSocketUrl` добавляет `?token=...` только в dev).
- WebSocket **не открывается до завершения auth bootstrap** (в Telegram — до успешного POST `/auth/telegram` и сохранения токена).

### Backend

- **Файлы:** `apps/server/src/app.ts` (GET /ws), `apps/server/src/auth/wsAuth.ts`.
- Токен извлекается из `request.headers['sec-websocket-protocol']` (или `request.raw.headers`) через **`extractAuthTokenFromSubprotocolHeader`** (тот же контракт, что и на клиенте).
- В **production** query-параметр не читается; fallback на `?token=` только при `isDevRuntime && allowDevAuth`.

---

## 3. Порядок: auth → WebSocket

1. WebSocket **не подключается раньше** получения токена (auth bootstrap).
2. После успешного Telegram auth (или dev auth):
   - любые **ранее открытые неавторизованные сокеты закрываются**;
   - создаётся **новый сокет** с передачей токена в `Sec-WebSocket-Protocol`.
3. Вызов `connect(token)` всегда закрывает существующий сокет (если есть) перед открытием нового с авторизацией.

---

## 4. Ссылки в коде

| Роль | Где |
|------|-----|
| Константы и создание протоколов | `packages/shared/src/models/wsProtocol.ts` |
| Извлечение токена на сервере | `apps/server/src/auth/wsAuth.ts` |
| Обработка GET /ws | `apps/server/src/app.ts` (чтение заголовка, вызов `extractAuthTokenFromSubprotocolHeader`, `authSessions.verify`) |
| Клиент: URL и вызов WebSocket | `apps/web/src/net/runtimeConfig.ts` (`getWebSocketUrl`), `apps/web/src/net/gameSessionStore.ts` (`connect` → `getWsProtocols`), `apps/web/src/net/wsClient.ts` (`connect(url, protocols)`) |
