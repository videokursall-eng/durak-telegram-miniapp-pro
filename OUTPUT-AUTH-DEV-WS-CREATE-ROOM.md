# Auth/dev, storage, WebSocket auth, and Create room

## 1. What POST /auth/dev returns

When `APP_ENV=development` and the server allows dev auth, **POST /auth/dev** returns a JSON object:

```json
{
  "token": "<session-token-string>",
  "user": {
    "telegramUserId": "dev_<clientId>",
    "username": null,
    "firstName": "<playerName>",
    "lastName": null,
    "photoUrl": null,
    "displayName": "<playerName>"
  }
}
```

- **token**: Opaque session token the backend uses to verify the client on WebSocket and other authenticated requests.
- **user**: Identity object (dev uses `telegramUserId: "dev_<clientId>"` and the provided player name).

On error (e.g. missing/invalid body or dev auth disabled), the server responds with 4xx and an error payload (e.g. `{ type: "error", code: "AUTH_INVALID", message: "..." }`).

---

## 2. Where the frontend stores it

- **Session storage (key `"durak.auth-session"`):** The full response `{ token, user }` is saved with `saveSessionJson(AUTH_STORAGE_KEY, payload)` right after a successful POST /auth/dev (or /auth/telegram) in `ensureAuthenticated()` in `apps/web/src/net/gameSessionStore.ts`. So the whole object is persisted for the tab’s lifetime.
- **In-memory snapshot:** The store also sets `setSnapshot({ authToken: payload.token })`, so the token is available as `snapshot.authToken` for the rest of the session.
- **Initial load:** On first read, the store’s snapshot is built from `loadSessionJson(AUTH_STORAGE_KEY)` so a refreshed page can reuse the stored session until the user clears it or the tab is closed.

Only the full `{ token, user }` object is stored; no separate “auth” vs “session” keys. The token is what’s used for WebSocket auth.

---

## 3. How the WebSocket now sends it

- **Mechanism:** Auth is sent **only** via the **Sec-WebSocket-Protocol** header in the WebSocket handshake. The backend does not use query, cookie, or other headers for WS auth.
- **Client side:** Before opening the socket, the frontend calls `createWsClientProtocols(authToken)` from `@durak/shared`, which returns `["durak.v1", "auth.<token>"]`. It passes this array as the second argument to `new WebSocket(url, protocols)`. The browser sends these as the `Sec-WebSocket-Protocol` request header.
- **Server side:** The server reads `Sec-WebSocket-Protocol`, finds the entry that starts with `"auth."`, and uses the rest as the session token to verify the connection.

So the token from /auth/dev is sent **only** in the WebSocket subprotocol list as `auth.<token>`; it is never sent as a query param, cookie, or other header.

---

## 4. Confirmation: Create room no longer fails with WebSocket error

Create room is fixed so that:

1. **Auth before WebSocket:** When the user clicks “Create room”, the frontend first calls `ensureAuthenticated(playerName, true)`, which performs POST /auth/dev, then stores the result and sets `authToken` in the snapshot. Only after that does it call `connect(token)` and then `sendMessage({ type: "room.create" })`. So the WebSocket is never opened without a token in dev.
2. **Protocols always set:** Whenever a connection is opened to the backend, the store uses `getWsProtocols(token)` (i.e. `createWsClientProtocols(authToken)`) and passes that to `WsClient.connect(url, protocols)`. The client never opens a WebSocket without this protocols array, so the server always receives the token via Sec-WebSocket-Protocol and does not log `wsAuthSource: "none"` or reject the handshake for missing auth.
3. **No race on first connect:** `sendMessage` only calls `connect()` when `connectionStatus !== "connecting"`, so the connection opened right after create room is not closed and replaced by a second connection before it finishes opening.

With this order and transport, **Create room no longer fails with a WebSocket connection error** in normal local dev (server running with `APP_ENV=development`, app at e.g. localhost:5173): /auth/dev succeeds, the token is stored, the WebSocket connects with auth in the protocol, and the server accepts the connection and processes `room.create`.
