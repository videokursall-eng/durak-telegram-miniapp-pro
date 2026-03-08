# Frontend app bootstrap sequence – audit

## 1. Where the WebSocket connection is created

| Location | What happens |
|----------|----------------|
| **`apps/web/src/net/wsClient.ts`** | `WsClient.connect(url, protocols)` calls `new WebSocket(url, protocols)` (line 26). This is the only place a WebSocket is constructed. |
| **`apps/web/src/net/gameSessionStore.ts`** | `GameSessionStore.connect(optionalToken?)` creates `new WsClient(...)` and calls `client.connect(getWebSocketUrl(), token ? getWsProtocols(token) : undefined)` (lines 201–205). So the **store** is the only caller that opens a WS; it passes URL and optional auth protocols. |

**Conclusion:** Every WebSocket is created via `gameSessionStore.connect()` → `WsClient.connect()`. There are no other code paths that create a WebSocket.

---

## 2. Where `/auth/dev` is called

| Location | When it runs |
|----------|----------------|
| **`apps/web/src/net/gameSessionStore.ts`** | **`ensureAuthenticated(playerName?, forceRefresh?)`** (lines 643–765). When `isLocalDevAuthEnabled()` is true and there is no Telegram `initData`, it builds a request to `getApiUrl(AUTH_DEV_PATH)` (i.e. `POST /auth/dev`) with `body: { playerName, clientId: getDevClientId() }` and runs `fetch(request.url, { method: 'POST', ... body: JSON.stringify(request.body) })`. On success it saves the session with `saveSessionJson(AUTH_STORAGE_KEY, payload)` and sets `authToken: payload.token` in the snapshot. |

**Callers of `ensureAuthenticated`:**

- **`createRoom(playerName)`** — `const token = await this.ensureAuthenticated(playerName, true); this.connect(token); this.sendMessage({ type: "room.create" });`
- **`joinRoom(roomId, playerName)`** — same pattern: `await ensureAuthenticated(...)`, then `connect(token)`, then `sendMessage(room.join)`
- **`attemptReconnect()`** — `await this.ensureAuthenticated();` then `this.sendMessage({ type: "player.reconnect", ... })`. The later `sendMessage` calls `connect(this.snapshot.authToken ?? undefined)`, and the snapshot already has `authToken` set by `ensureAuthenticated`.

**Conclusion:** `/auth/dev` is only used inside `ensureAuthenticated()`. It is always awaited before any `connect(token)` or `sendMessage()` that can trigger `connect(snapshot.authToken)` in the flows above.

---

## 3. Ensuring WebSocket is NOT created before auth in local development

Two mechanisms enforce “no WS before auth” in local dev:

### A. Guard inside `connect()` (lines 186–191)

```ts
// In local dev, never open WebSocket without a token; auth must complete first (POST /auth/dev).
if (isLocalDevAuthEnabled() && !token) {
  return;
}
```

- `token = optionalToken ?? this.snapshot.authToken ?? null`.
- If we're in local dev and there is no token, `connect()` returns without creating a client or calling `client.connect()`. So no WebSocket is opened without auth in that mode.

### B. Auto-connect on mount is skipped when there is no token (lines 784–798)

```ts
useEffect(() => {
  if (!autoConnect) return;
  // In local dev, do not auto-connect until we have a token (auth happens on create/join).
  if (isLocalDevAuthEnabled() && !gameSessionStore.getSnapshot().authToken) {
    return;
  }
  gameSessionStore.connect();
  return () => gameSessionStore.disconnect();
}, [autoConnect]);
```

- When `isLocalDevAuthEnabled()` is true and `authToken` is missing, the effect does **not** call `gameSessionStore.connect()`. So on initial load in local dev we do not attempt a WebSocket until the user has completed auth (e.g. by clicking Create/Join room, which runs `ensureAuthenticated` then `connect(token)`).

**Conclusion:** In local development, the WebSocket is not created before auth bootstrap completes: either we have a token (from session or from a completed auth flow) and then connect, or we never call `connect()` / we return early from `connect()`.

---

## 4. Auto-connect on app mount – delayed until auth is ready in local dev

- **Mount chain:** `App` → `useGameSocket()` → `useGameSession()` (from `gameSessionStore.ts`). The only place that triggers a connection on load is the `useEffect` in `useGameSession(autoConnect = true)` which calls `gameSessionStore.connect()`.
- **Local dev, no token:** The effect checks `isLocalDevAuthEnabled() && !gameSessionStore.getSnapshot().authToken` and, when true, returns without calling `connect()`. So **auto-connect is delayed** (skipped) until there is an `authToken` (e.g. after the user has done Create/Join and `ensureAuthenticated` has run, or after a reload with a persisted session).
- **Local dev, with token:** If the user already has a valid session (e.g. from a previous Create/Join in the same tab or from sessionStorage), `authToken` is present and the effect calls `connect()`, which passes the guard and opens the WebSocket with that token.
- **Production / Telegram:** `isLocalDevAuthEnabled()` is false; the effect does not skip, and `connect()` uses `snapshot.authToken` (from Telegram auth or persisted session) or falls through to demo fallback logic as before.

**Conclusion:** On app mount, in local development the WebSocket does not auto-connect until auth is ready (i.e. until there is an `authToken`). In production, behavior is unchanged (auto-connect when appropriate, using Telegram or existing token).

---

## 5. Bootstrap order summary (local dev)

1. **App mount** → `useGameSession(true)` runs.
2. **Effect:** `isLocalDevAuthEnabled() && !authToken` → **do not call `connect()`** → no WebSocket is created.
3. **User clicks “Создать комнату” or “Войти в комнату”** → `createRoom(playerName)` or `joinRoom(roomId, playerName)`.
4. **Auth:** `await ensureAuthenticated(playerName, true)` → **POST /auth/dev** → token stored in sessionStorage and `snapshot.authToken`.
5. **Connect:** `connect(token)` → guard passes → `new WsClient(...)` and `client.connect(getWebSocketUrl(), getWsProtocols(token))` → **WebSocket opened with auth**.
6. **Send:** `sendMessage(room.create | room.join)` → message sent (or queued and flushed when WS opens).

So in local development, **auth bootstrap always completes before the WebSocket is created**, and **mount-time auto-connect is delayed until a token exists**.
