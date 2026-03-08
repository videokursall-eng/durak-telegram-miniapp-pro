# WebSocket auth flow – what was wrong, what changed, how it works now

## 1. What was wrong in the WebSocket auth flow

- **Token not reaching /ws**  
  The frontend sometimes opened the WebSocket before the new token from `POST /auth/dev` was used. Create/join did not pass the freshly obtained token into the WebSocket connection, so the client could connect with an old or missing token and the server rejected the handshake.

- **Server not reading the protocol header correctly**  
  The auth token is sent in `Sec-WebSocket-Protocol`. On the upgrade request, this header can appear on `request.raw.headers` rather than `request.headers`. The server did not consistently read from both, so it could miss the token and reject valid connections.

- **Server crash on unauthorized WebSocket**  
  The unauthorized path used helpers that tried to resolve the socket from the request and threw when the shape was unexpected (“Unsupported websocket connection shape”), causing a 500 instead of closing the connection cleanly.

- **Wrong WebSocket handler signature**  
  With `@fastify/websocket` v11 the handler is `(socket, request)`. The code treated the first argument as the HTTP request and then tried to get the socket from it, which did not match the real connection shape and broke auth and message handling.

---

## 2. Files changed

| File | Changes |
|------|--------|
| **apps/server/src/app.ts** | WebSocket handler signature `(socket, request)`; read `Sec-WebSocket-Protocol` via `getHeader(request, "sec-websocket-protocol")` (and `request.headers`); token extraction and `authSessions.verify()`; `safeCloseUnauthorized` / `safeReplyWithError` (no throw, no 500); dev-only `getWsAuthDiagnostics` and logging (auth source, reject reason, no secrets). |
| **apps/server/src/auth/wsAuth.ts** | Use `WS_AUTH_SUBPROTOCOL_PREFIX` from `@durak/shared`; `extractAuthTokenFromSubprotocolHeader(header)` for comma-separated protocol list. |
| **apps/server/src/config.ts** | `allowDevAuth` only when `appEnv === "development"` (not any non-production). |
| **apps/server/.env.example** | Comments that `APP_ENV=development` enables `POST /auth/dev` for local WS auth; production must not enable dev auth. |
| **apps/web/src/net/gameSessionStore.ts** | `createRoom` / `joinRoom`: call `const token = await ensureAuthenticated(...)`, then `this.connect(token)`, then `this.sendMessage(...)` so the token from `/auth/dev` is passed into `connect()` and used for the WS subprotocol list. |
| **apps/web/src/lib/runtimeEnv.ts** | JSDoc for `isLocalDevAuthEnabled()` (dev-only, production never uses dev auth). |
| **packages/shared/src/models/wsProtocol.ts** | Shared `WS_AUTH_SUBPROTOCOL_PREFIX`, `createWsClientProtocols(authToken)`; server and client use the same contract. |
| **apps/server/scripts/verify-local.mjs** | Extended: second client auth + connect + join same room; asserts `room.joined.room.roomId` matches created room. |
| **docs/VERIFICATION.md** | E2E checklist (app URL, auth, WS, create, join, second tab, no 500) and updated description of `pnpm verify:local`. |

---

## 3. How WebSocket auth is now passed in dev

1. **Client**
   - Calls `POST /auth/dev` with `{ playerName, clientId }` (when `isLocalDevAuthEnabled()` is true).
   - Receives `{ token, user }`; stores it in `sessionStorage` under `"durak.auth-session"` and in the store as `authToken`.
   - On **Create room** or **Join room**: `ensureAuthenticated(playerName, true)` returns that token → `connect(token)` is called → `getWsProtocols(token)` builds `createWsClientProtocols(token)` = `["durak.v1", "auth." + token]` → `new WebSocket(wsUrl, protocols)`.
   - So the token is sent **only** in the **Sec-WebSocket-Protocol** header (subprotocol list); no query, cookie, or other header.

2. **Server**
   - Reads `Sec-WebSocket-Protocol` from `getHeader(request, "sec-websocket-protocol")` (checks both `request.headers` and `request.raw.headers`).
   - `extractAuthTokenFromSubprotocolHeader(header)` finds the value starting with `"auth."` and returns the token.
   - `authSessions.verify(token)` uses the same in-memory store as `POST /auth/dev` and `POST /auth/telegram`; if valid, the connection is accepted.

---

## 4. Confirmation: /auth/dev → /ws → room create/join works

- **Flow:** After a successful `POST /auth/dev`, the client uses the returned token in the WebSocket subprotocol when connecting to `/ws`. The server verifies the token and accepts the connection. The client then sends `room.create` or `room.join` over that connection and receives `room.created` or `room.joined`.
- **Code:** `createRoom` / `joinRoom` in `gameSessionStore.ts` explicitly do `const token = await ensureAuthenticated(...); this.connect(token); this.sendMessage(...)`, so the token from `/auth/dev` is always used for the WebSocket handshake.
- **Verification script:** `pnpm verify:local` (with the server running and `APP_ENV=development`) checks: health → `POST /auth/dev` → WebSocket connect (no 500) → `room.create` → `room.created` → second client `POST /auth/dev` → second client connect → `room.join` with same room id → `room.joined` with matching `roomId`.
- **Manual check:** Open the app at http://localhost:5173, create a room (triggers `/auth/dev` then `/ws` then `room.create`), then in a second tab join with the room code; both tabs show the same room and players.

**Conclusion:** `/auth/dev` → `/ws` → room create/join is implemented and verified; in dev, WebSocket auth is passed solely via the `Sec-WebSocket-Protocol` subprotocol after a successful `/auth/dev` login.
