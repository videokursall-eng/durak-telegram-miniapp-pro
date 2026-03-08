# Frontend auth/bootstrap, WebSocket client, and app init – file map

## 1. Apps/web auth & bootstrap

| File | Role |
|------|------|
| **`apps/web/src/net/gameSessionStore.ts`** | **Single place for auth bootstrap and session.** Defines `AuthSession` type (`token` + `user`), `AUTH_STORAGE_KEY` (`"durak.auth-session"`), `AUTH_DEV_PATH`/`AUTH_TELEGRAM_PATH`. **`ensureAuthenticated(playerName?, forceRefresh?)`** builds request (Telegram `initData` → `/auth/telegram`, else local dev → `/auth/dev` with `playerName`, `clientId`), runs `fetch`, on success calls `saveSessionJson(AUTH_STORAGE_KEY, payload)` and `setSnapshot({ authToken: payload.token })`. Initial snapshot loads `persistedAuth = loadSessionJson<AuthSession>(AUTH_STORAGE_KEY)` and sets `authToken: persistedAuth?.token ?? null`. No separate auth module; bootstrap lives in the store. |
| **`apps/web/src/lib/runtimeEnv.ts`** | **Dev vs prod gating.** `getClientAppEnv()`, `isDevelopmentAppEnv()`, **`isLocalDevAuthEnabled()`** (`import.meta.env.DEV && isDevelopmentAppEnv()`). Used by gameSessionStore to decide Telegram vs `/auth/dev` and to skip auto-connect when no token in local dev. |

There are no other dedicated “auth” or “bootstrap” files; auth is entirely in `gameSessionStore` + `runtimeEnv`.

---

## 2. Apps/web WebSocket client

| File | Role |
|------|------|
| **`apps/web/src/net/wsClient.ts`** | **Thin WebSocket wrapper.** `WsClient` holds `socket`, `onMessage`, `onStatus`, `onError`. **`connect(url, protocols?)`** does `new WebSocket(url, protocols)` when provided; no auth in URL or headers. **`send(payload)`** JSON-stringifies and sends when open. **`disconnect()`** closes socket and nulls reference. JSDoc states: when connecting to app backend, pass protocols from `createWsClientProtocols(authToken)` so server gets auth via Sec-WebSocket-Protocol. |
| **`apps/web/src/net/gameSessionStore.ts`** | **Owns the WsClient and when to connect.** Holds `private client: WsClient | null`. **`connect(optionalToken?)`** resolves token (optionalToken ?? snapshot.authToken), guards (local dev without token return; demo fallback path), closes existing client if reconnecting with token, then builds `protocols = isUsingDemoFallback ? undefined : getWsProtocols(token!)` and calls **`client.connect(getWebSocketUrl(), protocols)`**. **`getWsProtocols(token)`** calls **`createWsClientProtocols(authToken)`** from `@durak/shared`. So the **store** is the only place that creates and connects `WsClient`; protocols come from shared package. |
| **`apps/web/src/net/runtimeConfig.ts`** | **API/WS URLs.** `getApiBaseUrl()`, `getWebSocketUrl()` (dev: `VITE_API_BASE_URL` / `VITE_WS_BASE_URL` or defaults `http://127.0.0.1:8080`, `ws://127.0.0.1:8080`; prod: env or window origin). One-time dev log of API and WS URL. |
| **`packages/shared/src/models/wsProtocol.ts`** | **Shared WS auth contract.** `WS_AUTH_SUBPROTOCOL_PREFIX = "auth."`, **`createWsClientProtocols(authToken)`** → `["durak.v1", "auth." + authToken]`. Used by frontend for protocols; backend uses same prefix in `wsAuth.ts`. |

---

## 3. App initialization hooks / providers

| File | Role |
|------|------|
| **`apps/web/src/App.tsx`** | **Root component.** Uses **`useGameSocket()`** (no explicit provider). No auth or WS init in App itself; only Telegram UI (`getTg().ready()`, etc.) and `gameUiBus` in `useEffect`, and a `useEffect` that calls `enterGame()` when `roomStatus === "starting"` and `roomState` is set. |
| **`apps/web/src/net/useGameSocket.ts`** | **Hook that wraps useGameSession.** `useGameSocket()` returns `useGameSession()` result (connectionStatus, room, createRoom, joinRoom, etc.). No extra providers or context. |
| **`apps/web/src/net/gameSessionStore.ts`** | **`useGameSession(autoConnect = true)`** — **only place that triggers connect on app load.** `useSyncExternalStore` for snapshot; **`useEffect`** when `autoConnect`: if local dev and no `authToken`, **does not call** `gameSessionStore.connect()`; otherwise calls `gameSessionStore.connect()` and cleanup calls `disconnect()`. So **mount-time auto-connect is skipped in local dev until a token exists** (e.g. after Create/Join). |

There is no React Context or other provider for auth or WebSocket; the store is a singleton and the hook subscribes to it.

---

## 4. Backend WS auth (contract alignment)

| File | Role |
|------|------|
| **`apps/server/src/app.ts`** | **WS route** `GET /ws`: reads **`Sec-WebSocket-Protocol`** via `getHeader(request, "sec-websocket-protocol")`, then **`extractAuthTokenFromSubprotocolHeader(rawSubprotocolHeader)`**, then **`authSessions.verify(authToken)`**. Comment states: auth transport is **only** Sec-WebSocket-Protocol; query, cookie, and Authorization header are **not** used for verification (only diagnostics). |
| **`apps/server/src/auth/wsAuth.ts`** | **`extractAuthTokenFromSubprotocolHeader(header)`** uses **`WS_AUTH_SUBPROTOCOL_PREFIX`** from `@durak/shared`; finds value starting with that prefix, returns the suffix as token. **`createAuthSubprotocols(token)`** (server-side helper) returns `["durak.v1", "auth." + token]` — same shape as frontend’s `createWsClientProtocols`. |

**Contract:** Backend expects token **only** in **Sec-WebSocket-Protocol** as a subprotocol **`auth.<token>`**. Frontend sends **only** via **`new WebSocket(url, createWsClientProtocols(authToken))`**. Shared package defines the prefix and client protocol builder; no change needed for alignment.

---

## Quick reference

- **Auth bootstrap:** `gameSessionStore.ensureAuthenticated()` → POST `/auth/dev` or `/auth/telegram` → `saveSessionJson(AUTH_STORAGE_KEY, payload)` + `setSnapshot({ authToken })`.
- **WS creation:** `gameSessionStore.connect(token?)` → `new WsClient(...)` + `client.connect(getWebSocketUrl(), getWsProtocols(token))` → `new WebSocket(url, ["durak.v1", "auth." + token])`.
- **App init:** `App` → `useGameSocket()` → `useGameSession(true)` → effect runs `gameSessionStore.connect()` only if not (local dev and no token).
- **Backend:** `/ws` reads token from `Sec-WebSocket-Protocol` via shared prefix; no query/cookie/header for auth.
