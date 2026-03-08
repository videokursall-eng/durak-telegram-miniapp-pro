# Frontend auth & WebSocket inspection

## 1. Auth bootstrap (apps/web)

**Files:** `apps/web/src/net/gameSessionStore.ts`, `apps/web/src/lib/runtimeEnv.ts`

- **Where:** `GameSessionStore.ensureAuthenticated(playerName?, forceRefresh?)` (private).
- **When:** Called by `createRoom`, `joinRoom`, `attemptReconnect` before any WebSocket connection.
- **Flow:**
  - If Telegram `initData` present → POST `/auth/telegram` with `{ initData }`.
  - Else if `isLocalDevAuthEnabled()` → POST `/auth/dev` with `{ playerName, clientId }` (dev-only).
  - Else → no request; sets error "Telegram initData is unavailable and local development auth is disabled".
- **Persistence:** On success, `saveSessionJson(AUTH_STORAGE_KEY, payload)` (sessionStorage) and `setSnapshot({ authToken: payload.token })`. Initial snapshot loads `authToken` from `loadSessionJson(AUTH_STORAGE_KEY)`.
- **Runtime flag:** `isLocalDevAuthEnabled()` = `import.meta.env.DEV && getClientAppEnv() === "development"` (see `runtimeEnv.ts`).

No separate "auth bootstrap" entry point: auth runs on first create/join/reconnect, then token is reused until cleared or force-refresh.

---

## 2. WebSocket client (apps/web)

**Files:** `apps/web/src/net/wsClient.ts`, `apps/web/src/net/gameSessionStore.ts`

- **WsClient** (`wsClient.ts`): Thin wrapper around `WebSocket`. `connect(url, protocols)` requires a non-empty `protocols` array and calls `new WebSocket(url, validProtocols)` so the backend receives auth via `Sec-WebSocket-Protocol`.
- **Who creates WS:** Only `GameSessionStore.connect()`. It builds protocols with `getWsProtocols(token)` → `createWsClientProtocols(authToken)` from `@durak/shared`, then `client.connect(getWebSocketUrl(), protocols)`.
- **When connect runs:** (1) After `ensureAuthenticated()` in createRoom/joinRoom/attemptReconnect, (2) From `useGameSession` effect only when not local-dev or when `authToken` already exists (no WS before dev auth), (3) From `sendMessage` when not connected and not already "connecting".

---

## 3. App init / provider / hooks

**Files:** `apps/web/src/main.tsx`, `apps/web/src/App.tsx`, `apps/web/src/net/useGameSocket.ts`, `apps/web/src/net/gameSessionStore.ts`

- **main.tsx:** Renders `<StrictMode><App /></StrictMode>`. No auth or WebSocket init.
- **App.tsx:** Uses `useGameSocket()` for all session state and actions; no extra provider. Renders Lobby / Reconnect / Waiting / Game by `roomStatus` and `connectionStatus`.
- **useGameSocket:** Re-exports `useGameSession()` from `gameSessionStore.ts` (same singleton store).
- **useGameSession(autoConnect = true):** Subscribes to `gameSessionStore` via `useSyncExternalStore`. Effect: if `autoConnect` and (not local dev or `authToken` present), calls `gameSessionStore.connect()`; on unmount calls `disconnect()`. So in local dev, no auto-connect until a token exists (e.g. after create/join).

No React context/provider for auth or WS; a single store instance and one hook surface.

---

## 4. Backend WS auth contract & alignment

**Backend:** `apps/server/src/auth/wsAuth.ts`, `apps/server/src/app.ts` (GET /ws). Auth only via `Sec-WebSocket-Protocol`. Token extracted with `extractAuthTokenFromSubprotocolHeader(header)` from `@durak/shared`: looks for a subprotocol value starting with `WS_AUTH_SUBPROTOCOL_PREFIX` (`"auth."`), then takes the rest as the token.

**Shared:** `packages/shared/src/models/wsProtocol.ts`: `WS_PROTOCOL_VERSION = "durak.v1"`, `WS_AUTH_SUBPROTOCOL_PREFIX = "auth."`, `createWsClientProtocols(authToken)` → `["durak.v1", "auth." + authToken]`.

**Frontend alignment:**
- Uses `createWsClientProtocols(authToken)` from `@durak/shared` only (via `getWsProtocols(token)` in gameSessionStore).
- Never opens a WebSocket without passing this protocols array (WsClient requires protocols; store only calls connect when it has a token and passes `getWsProtocols(token)`).
- Order: auth first (ensureAuthenticated), then connect(token), then send messages. In local dev, effect does not call connect() until authToken exists.

**Change made:** Comment in `gameSessionStore.ts` at `getWsProtocols`: "Backend accepts auth only via Sec-WebSocket-Protocol; use shared contract so server can extract token." No code change required; frontend already matches the backend contract.
