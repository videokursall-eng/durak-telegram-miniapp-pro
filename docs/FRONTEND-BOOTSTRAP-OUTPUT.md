# Frontend bootstrap order – what was wrong, what changed, how auth is passed

## 1. What was wrong in frontend bootstrap order

- **WebSocket could open before auth in local dev.** The app mount effect in `useGameSession(true)` called `gameSessionStore.connect()` with no arguments. If the store had no token (first load) but some path allowed opening a socket anyway (e.g. demo fallback logic), the client would call `new WebSocket(url, undefined)` and connect **without** auth. The server then saw `wsAuthSource: "none"`, `rejectReason: "missing"`, and rejected the handshake.
- **No guard against opening WS without a token in dev.** There was no rule that “in local dev, never open a WebSocket until we have a token,” so an early or accidental `connect()` could create an unauthenticated connection.
- **Existing connection could block re-auth.** After a successful `POST /auth/dev`, callers did `connect(token)` and then `sendMessage(...)`. But `connect()` started with `if (this.client) return;`, so if an old (e.g. rejected) WebSocket client was still present, the new token was never used and no authorized connection was opened.
- **Reconnect after auth was not explicit.** `attemptReconnect()` did `await ensureAuthenticated()` then `sendMessage(...)` without calling `connect(token)`, relying on `sendMessage` to call `connect(snapshot.authToken)`. That worked only if the snapshot was already updated and no stale client was in the way.

So the problems were: (1) possible WS-before-auth on load, (2) no “dev = no WS without token” rule, (3) old client preventing new authenticated connection, (4) reconnect flow not clearly “auth → connect with new token → send.”

---

## 2. What files were changed

| File | Changes |
|------|--------|
| **apps/web/src/net/gameSessionStore.ts** | **Bootstrap order:** (a) In `connect(optionalToken?)`: if `isLocalDevAuthEnabled() && !token`, return immediately (never open WS in local dev without a token). (b) In `connect()`: if we have a token and `this.client` already exists, call `this.client.disconnect()` and set `this.client = null` so the next step opens a **fresh** authenticated WebSocket. (c) In `useGameSession`’s `useEffect`: if `isLocalDevAuthEnabled() && !gameSessionStore.getSnapshot().authToken`, do **not** call `gameSessionStore.connect()` on mount (delay auto-connect until auth exists). (d) **Protocols:** when not in demo fallback, always pass `getWsProtocols(token!)` to `client.connect()` so auth is sent via Sec-WebSocket-Protocol. (e) **attemptReconnect:** after `ensureAuthenticated()` call `this.connect(token)` explicitly, then `sendMessage(...)`. (f) **Auth success:** after saving session and setting `authToken`, added comment that snapshot is updated for subsequent `connect()`/`sendMessage()`. (g) **Dev logs:** auth bootstrap start/success, websocket connect attempt with `wsAuthSource`, reconnect-after-auth when closing existing WS. |
| **apps/web/src/net/wsClient.ts** | JSDoc on `connect()`: when connecting to the app backend, pass protocols from `createWsClientProtocols(authToken)` so the server receives auth via Sec-WebSocket-Protocol. |
| **packages/shared/src/models/wsProtocol.ts** | Comment that server accepts auth only via Sec-WebSocket-Protocol and client must pass protocols so auth source is never `"none"`. |
| **docs/** | **VERIFICATION.md:** “Expected sequence (local dev)” table and note that `pnpm verify:local` checks the flow. **FRONTEND-BOOTSTRAP-AUDIT.md**, **AUTH-PERSISTENCE-AUDIT.md**, **WEBSOCKET-AUTH-TRANSPORT.md**, **INSPECT-FRONTEND-AUTH-WS.md** added or updated for audits and contract. |

No backend logic was changed for “auth before WS”; only frontend bootstrap and reconnect behavior.

---

## 3. How WebSocket auth is now passed

- **Single transport:** Auth is passed **only** via **Sec-WebSocket-Protocol**. The client calls `new WebSocket(url, protocols)` with **`protocols = createWsClientProtocols(authToken)`** from `@durak/shared` → **`["durak.v1", "auth." + token]`**. The server reads the upgrade request’s `Sec-WebSocket-Protocol` header, finds the value starting with `"auth."`, and uses the remainder as the token. No query param, cookie, or other header is used for verification.
- **When it’s sent:** (1) **createRoom** / **joinRoom:** `ensureAuthenticated()` returns a token → `connect(token)` → store builds `protocols = getWsProtocols(token)` and calls `client.connect(getWebSocketUrl(), protocols)`. (2) **attemptReconnect:** `ensureAuthenticated()` returns a token → `connect(token)` → same. (3) **Mount (non–local dev or with persisted token):** effect calls `connect()` → token from `snapshot.authToken` (from storage or previous auth) → same protocols. In local dev with no token, the effect does **not** call `connect()`, so no WS is opened until the user triggers create/join and auth runs first.
- **Replacing an old connection:** If `connect(token)` is called and there is already a client, the store disconnects it and sets `this.client = null`, then creates a new `WsClient` and connects with the given token. So after `/auth/dev` success, the next `connect(token)` always results in one authenticated connection (no leftover unauthenticated socket).

---

## 4. Confirmation: /auth/dev happens before authorized /ws connection

- **createRoom / joinRoom:** They run **`const token = await this.ensureAuthenticated(playerName, true)`** (which performs **POST /auth/dev** in local dev and returns the token), then **`this.connect(token)`**, then **`this.sendMessage(...)`**. So **/auth/dev completes first**, then the WebSocket is opened with that token. Order is guaranteed by `await`.
- **attemptReconnect:** It runs **`const token = await this.ensureAuthenticated()`** then **`this.connect(token)`** then **`this.sendMessage(...)`**. Again **/auth/dev (or /auth/telegram) completes before** any **connect()** with that token.
- **Mount:** In local dev, the effect calls **`gameSessionStore.connect()`** only when **`gameSessionStore.getSnapshot().authToken`** is already set (e.g. from session storage after a previous auth). So on **first** load in local dev there is no token → effect does **not** call `connect()` → no WebSocket is opened until the user clicks Create or Join, which triggers **/auth/dev** and then **connect(token)**. So **/auth/dev always happens before** the first authorized **/ws** connection in that scenario.
- **Guard in connect():** If somehow `connect()` were called without a token in local dev, **`isLocalDevAuthEnabled() && !token`** would cause an immediate return, so no WebSocket would be created. So an authorized **/ws** connection in local dev is only possible when a token is already available (from a completed **/auth/dev** or persisted session).

**Conclusion:** In local dev, **/auth/dev** (or a previously stored session from it) **always completes before** an authorized **/ws** connection is opened. The flow is either “user action → ensureAuthenticated() → /auth/dev → then connect(token)” or “mount with existing token → connect()”; there is no path that opens **/ws** before auth in local dev.
