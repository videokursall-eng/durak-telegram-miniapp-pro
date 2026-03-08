# Backend WebSocket route inspection (/ws after token extraction)

## 1. /ws handler location and flow

- **File:** `apps/server/src/app.ts`
- **Route:** `app.get(WS_PATH, { websocket: true }, (socket, request) => { ... })` with `WS_PATH = "/ws"`.
- **When it runs:** With `@fastify/websocket`, the handler is invoked **after** the HTTP upgrade to WebSocket completes. The handler runs synchronously: it extracts the token, validates the session, then registers `socket.on("message")` and `socket.on("close")`. It does **not** return a Promise that could stall the upgrade.

---

## 2. Token parsing and validation

### Token extraction

- **From protocol header:**  
  `rawSubprotocolHeader` is read from, in order:
  - `rawReq?.headers?.["sec-websocket-protocol"]`
  - `getHeader(request, "sec-websocket-protocol")` (tries `request.headers` and `request.raw.headers`)
  - `request.headers?.["sec-websocket-protocol"]`
- **Function:** `extractAuthTokenFromSubprotocolHeader(rawSubprotocolHeader)` (`apps/server/src/auth/wsAuth.ts`).
  - Normalizes header to a string (array of values joined by `","`).
  - Splits by `","`, trims, finds the value that starts with `WS_AUTH_SUBPROTOCOL_PREFIX` (`"auth."` from `@durak/shared`).
  - Returns the substring after the prefix, or `null` if missing.
- **Dev fallback (query):**  
  If `authToken` is still falsy and `isDevRuntime && allowDevAuth`:
  - Full URL is taken from `wsFullUrlByRequest.get(request)` (set in `onRequest` for path `WS_PATH`) or `request.raw?.url` or `request.url`.
  - `getQueryParamsFromUrl(url)` parses `?token=...` or `?auth=...`; keys are lowercased, values `decodeURIComponent`’d.
  - If `query.token` or `query.auth` is present, it is used as `authToken` and `wsAuthSource = "query"`.

So the token is **parsed** from either:

1. `Sec-WebSocket-Protocol` (production and dev), or  
2. Query `token`/`auth` (dev only when protocol is missing and `allowDevAuth`).

### Token validation

- **Call:** `authSessions.verify(authToken)` (`apps/server/src/auth/sessionStore.ts`).
- **Behavior:**
  - If `token` is null/undefined/empty → returns `null`.
  - Otherwise `this.sessions.get(token)`; if no session → returns `null`.
  - If session exists, checks `session.expiresAt <= this.nowMs()`; if expired, deletes the session and returns `null`.
  - Otherwise returns the `TrustedAuthSession` (`{ token, user, issuedAt, expiresAt }`).
- **No throw:** `verify()` only returns `null` on failure; it does not throw.

So the token is **validated** via in-memory session lookup and TTL check. Session is created only by POST `/auth/telegram` or POST `/auth/dev`, which call `authSessions.issue(user)` and store the session by token.

---

## 3. Auth/session lookup success

- **On success:** `authSession = authSessions.verify(authToken)` is a non-null `TrustedAuthSession`; `authenticatedUser = authSession.user` is used for the rest of the handler.
- **On failure:** `if (!authSession)` then:
  - In dev, logs `"websocket auth fail"` with `connectionId`, `wsAuthSource`, `rejectReason`, `authSourcesPresent`.
  - Calls `safeCloseUnauthorized(socket, "Trusted auth token is required")` (sends error JSON and closes with code 4401).
  - **return** — no further handlers are attached; the socket is closed.

So when the session lookup **succeeds**, the handler continues; when it **fails**, it closes the socket and returns without attaching `message`/`close` handlers.

---

## 4. Player connection/session creation

- **No “player” entity at upgrade time.**  
  The /ws handler does **not** create a “player” or “connection” record in persistence at upgrade. It only:
  - Generates a **connectionId** (`"conn_" + Date.now() + "_" + random`).
  - Keeps `currentRoom: GameRoom | null` in closure.
- **Player/room binding happens on first message:**
  - **room.create** → `registry.createRoom()`, then `currentRoom.createHost(authenticatedUser, { id: connectionId, send })` → creates the host **player** in the room and binds the connection.
  - **room.join** → `room.join(authenticatedUser, { id: connectionId, send })` → adds a **player** and binds the connection.
  - **player.reconnect** → `room.reconnect(authenticatedUser, sessionToken, { id: connectionId, send })` → rebinds the connection to an existing player.

So: **connection/session** at the WebSocket layer is “authenticated connection identified by connectionId and authenticatedUser”. A **player** in a **room** is created only when the client sends `room.create` or `room.join` (or `player.reconnect`). That is by design: the socket is “ready” after auth, and the first message creates or joins the room.

---

## 5. Handler does not silently stall after upgrade

- **Synchronous path:**  
  After `authSession` is verified:
  1. Log `"websocket auth success"`.
  2. (Dev) Log `"ws connection ready"`.
  3. Register `socket.on("message", ...)`.
  4. Register `socket.on("close", ...)`.
  5. Handler returns.

  All of this is synchronous. There is no `await` or `return` of a Promise in the success path. So the handler **does not** silently stall after the upgrade.

- **Errors:**  
  The whole handler is inside `try { ... } catch (err) { ... safeCloseUnauthorized(socket, "Server error"); }`. If anything throws (e.g. in getHeader, getQueryParamsFromUrl, or verify), the socket is closed with an error and the failure is logged in dev. So a failure does not leave the connection hanging; it closes the socket.

- **Log sequence (dev) when everything works:**  
  1. `"ws upgrade (dev)"` (onRequest already ran and stored full URL).  
  2. `"ws upgrade request headers (dev)"`.  
  3. `"websocket auth source"`.  
  4. `"websocket auth success"`.  
  5. `"ws connection ready"` (added so “handler attached” is visible).  

If you see up to and including **"ws connection ready"**, the handler has finished and the socket is ready for messages. If you never see **"websocket auth success"** or **"ws connection ready"**, the failure is before that (e.g. token missing/expired, or exception in extraction/verify).

---

## Summary

| Check | Result |
|-------|--------|
| Token is parsed | Yes: from `Sec-WebSocket-Protocol` (and in dev from query when protocol missing and allowDevAuth). |
| Token is validated | Yes: `authSessions.verify(token)` — in-memory session + TTL; returns null on failure, no throw. |
| Auth/session lookup success | On success, handler continues with `authenticatedUser`; on failure, socket is closed and handler returns. |
| Player connection/session created | Player/room binding is created on first message (`room.create` / `room.join` / `player.reconnect`), not at upgrade. Connection is “authenticated socket” after upgrade. |
| Handler does not silently stall | Handler is synchronous after upgrade; it only registers listeners and returns. Dev log `"ws connection ready"` confirms setup completed. |
