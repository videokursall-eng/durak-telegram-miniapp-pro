# WebSocket bootstrap contract (frontend ↔ backend)

## What the frontend waits for before removing "Connecting to server"

The UI shows "Подключаемся к серверу" (or "Connecting to server") when **`connectionStatus === "connecting"`**.

**The frontend removes that state only when `connectionStatus` becomes `"connected"`.**

### Where `connectionStatus` is set

- **`"connecting"`** — set in `gameSessionStore.connect()` when opening the WebSocket (`setSnapshot({ connectionStatus: "connecting" })`).
- **`"connected"`** — set only in **`handleStatusChange(true)`**, which is called from **`WsClient.socket.onopen`** (the browser’s native WebSocket open event).

So the frontend **does not** wait for any application-level message from the server (no `ready`, `auth.ok`, `room.state`, or `lobby.state`) to clear "Connecting to server". It only waits for the **WebSocket handshake to complete** (native `onopen`).

### What the frontend does **not** expect

| Message / concept | Used to leave "connecting"? |
|-------------------|----------------------------|
| `connected` (state) | Yes — but this state is set on **browser `onopen`**, not on a server message. |
| `ready` (server message) | No — there was no such message; we now have `connection.ready` (see below). |
| `auth.ok` | No — auth is done via POST `/auth/telegram` before the WebSocket is opened; WS carries the token in the handshake. |
| `room.state` | No — only after the client has joined/created a room. |
| `lobby.state` | No — not in the protocol. |

---

## Aligned contract

### Backend

1. **Handshake:** GET /ws with auth (Sec-WebSocket-Protocol or, in dev, query `token`). Server validates the token and completes the WebSocket upgrade.
2. **After upgrade:** Server attaches `socket.on("message")` and `socket.on("close")` (no async stall).
3. **First server event (immediate):** Server sends **`connection.ready`** once, right after registering the client. This message includes:
   - **Connection acknowledged** — client knows the server has finished bootstrap.
   - **Current player/session info** — optional `user: { telegramUserId, displayName }` (no secrets). Omitted only if server cannot provide it.
   - There is no room/lobby state in this message because the client has not created or joined a room yet.
4. The client is **never left waiting** for the first message: `connection.ready` is sent synchronously right after "ws client registered", before any `socket.on("message")` handler runs.
5. **Room/lobby:** Room state is sent only when the client sends `room.create` or `room.join`; the server replies with `room.created` or `room.joined` (and may broadcast `room.players`).

### Frontend

1. **Opening:** Calls `connect(token)` → sets `connectionStatus: "connecting"`, creates `WsClient`, calls `client.connect(url, protocols)`.
2. **Handshake complete (primary):** Browser fires **`socket.onopen`** → `WsClient` calls `onStatus(true)` → **`handleStatusChange(true)`** → **`connectionStatus: "connected"`** → UI leaves "Connecting to server". The frontend **relies on socket open** to clear "connecting"; it does **not** wait for a server message.
3. **First server message (handled):** The server sends **`connection.ready`** immediately after auth. The frontend handles it in **`handleMessage`**:
   - **Defensive:** If still in `"connecting"` when `connection.ready` is received (e.g. open event ordering), it sets **`connectionStatus: "connected"`** so the client never waits forever for the first message.
   - **Otherwise:** No state change (we already set "connected" on open); dev log only.
4. **Room flow:** Client sends `room.create` or `room.join`; server replies with `room.created` / `room.joined`; frontend updates room state and UI.

So **both** are implemented clearly: (1) **socket open** clears "connecting" (primary); (2) **connection.ready** is always sent by the server and handled by the frontend, and clears "connecting" defensively if still in that state.

### Summary

| Signal | Backend | Frontend |
|--------|---------|----------|
| **Handshake success** | Completes upgrade, registers handlers, sends `connection.ready`. | Sets `connectionStatus: "connected"` on **WebSocket `onopen`** (primary). |
| **First message** | Sends **`connection.ready`** once after "ws client registered". | Handles `connection.ready`; if still `"connecting"`, sets `"connected"` (defensive so client never waits forever). |
| **Room / lobby** | Sends `room.created`, `room.joined`, `room.players`, etc., in response to client messages. | Uses these to show lobby/game; not used to leave "Connecting to server". |

So:

- **"Connecting to server"** is removed when the **WebSocket handshake succeeds** (`onopen` → `connectionStatus: "connected"`) or, defensively, when **`connection.ready`** is received while still in `"connecting"`.
- The backend **always sends** `connection.ready` (with optional session/player info) **immediately** after successful auth, so the client is **never left waiting** for the first message; the frontend handles it and clears "connecting" if needed.
- **Both** paths are implemented: (1) clear on **socket open** (primary), (2) clear on **connection.ready** if still connecting (defensive).

---

## Files

- **Frontend:** `apps/web/src/net/gameSessionStore.ts` (`connectionStatus`, `handleStatusChange`), `apps/web/src/net/wsClient.ts` (`onopen` → `onStatus(true)`), `apps/web/src/App.tsx` (loading label when `connectionStatus === "connecting"`).
- **Backend:** `apps/server/src/app.ts` (GET /ws: auth, then `connectionSend({ type: "connection.ready" })`, then `socket.on("message")`).
- **Shared:** `packages/shared/src/models/protocol.ts` (`ConnectionReadyMessage`, `ServerToClientMessage`).
