# WebSocket auth transport – contract

## How the backend expects WebSocket auth

| Source | Used for verification? | Notes |
|--------|-------------------------|--------|
| **Sec-WebSocket-Protocol** | **Yes** | Only source used. Server reads the header, finds a comma-separated value starting with `"auth."`, and uses the remainder as the token. |
| Query param (`?token=...` or `?auth=...`) | No | Only checked for diagnostics (authSourcesPresent). |
| Cookie | No | Only checked for diagnostics. |
| Header (e.g. `Authorization`) | No | Only checked for diagnostics. |

**Code:** `apps/server/src/app.ts` — handler reads `getHeader(request, "sec-websocket-protocol")`, then `extractAuthTokenFromSubprotocolHeader(rawSubprotocolHeader)` (in `auth/wsAuth.ts`), then `authSessions.verify(authToken)`.

So the backend expects auth **only** via **WebSocket subprotocol** (a protocol string `"auth.<token>"` in the `Sec-WebSocket-Protocol` header).

---

## How the frontend sends auth

| Mechanism | Used? | Implementation |
|-----------|--------|----------------|
| Query param | No | Not added to WS URL. |
| Cookie | No | Not set for WS. |
| Header | No | Browser does not allow setting headers on `new WebSocket()`. |
| **WebSocket protocols** | **Yes** | `new WebSocket(url, protocols)` with `protocols = createWsClientProtocols(authToken)` → `["durak.v1", "auth." + token]`. |

**Code:** `apps/web/src/net/gameSessionStore.ts` — when not in demo fallback, `protocols = getWsProtocols(token)` (which calls `createWsClientProtocols(token)` from `@durak/shared`). Then `client.connect(getWebSocketUrl(), protocols)`. `apps/web/src/net/wsClient.ts` — `new WebSocket(url, protocols)`.

So the frontend sends auth **only** via the **protocols** argument of the WebSocket constructor, which becomes the `Sec-WebSocket-Protocol` header on the upgrade request.

---

## Alignment

- Backend accepts auth **only** from **Sec-WebSocket-Protocol**.
- Frontend sends auth **only** via **protocols** (subprotocol list).
- Shared contract in `packages/shared/src/models/wsProtocol.ts`: `WS_AUTH_SUBPROTOCOL_PREFIX = "auth."`, `createWsClientProtocols(authToken)`.

So the transport is aligned: one source (protocol), same format (`auth.<token>`).

---

## Ensuring auth source is never "none"

- **Backend:** `wsAuthSource: "none"` and `rejectReason: "missing"` occur when no token is extracted from the protocol header (e.g. client connected without protocols or without an `auth.` subprotocol).
- **Frontend:**
  1. In local dev, `connect()` is not called without a token (guard and mount-effect skip).
  2. When connecting to the real backend (not demo fallback), the store always passes `getWsProtocols(token)` so the server receives auth via protocol.
  3. Demo fallback uses `protocols = undefined` and does not connect to the real server, so the backend is not involved.

So for any connection to the real backend, the frontend sends auth in the expected format (protocol), and the server will see `wsAuthSource: "protocol"` (or "invalid_or_expired" if the token is bad), not "none".
