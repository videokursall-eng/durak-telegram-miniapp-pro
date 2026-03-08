# Local verification (Task 9)

After fixes, verify the following.

## Expected sequence (local dev)

Verify this order in the browser and server logs:

| # | Step | How to confirm |
|---|------|----------------|
| 1 | **App loads** | Open http://localhost:5173; no WS opened yet in local dev (no token). |
| 2 | **POST /auth/dev succeeds** | After clicking Create or Join, server log: `auth bootstrap: dev`; frontend console: `[dev] auth bootstrap start` then `[dev] auth bootstrap success`. |
| 3 | **Frontend stores auth** | Session storage has `durak.auth-session` with `token` and `user`; snapshot has `authToken`. |
| 4 | **Frontend opens authenticated /ws** | Frontend console: `[dev] websocket connect attempt` with `wsAuthSource: "protocol"`; then `WS connected`. |
| 5 | **Server logs WS auth source not "none"** | Server log: `ws connect` with `wsAuthSource: "protocol"` (not `wsAuthSource: "none"`). |
| 6 | **Room create/join flow possible** | Create room shows waiting room + code; second tab can join with code; both see same room. |

**Quick automated check:** With server running, run `pnpm verify:local` from repo root. It runs health → /auth/dev → /ws (with token) → room.create → room.created → second client auth + /ws + room.join → same room. If the server logs `ws auth rejected` with `rejectReason: "missing"` or `wsAuthSource: "none"`, the frontend is not sending auth; the expected sequence above should prevent that.

## E2E checklist (local)

| # | Step | How to verify |
|---|------|----------------|
| 1 | App at http://localhost:5173 | Start web with `pnpm --filter web dev`; open the URL in a browser. |
| 2 | POST /auth/dev succeeds | In app, create or join triggers auth; or run `pnpm verify:local` (step 2). |
| 3 | WebSocket /ws connects successfully | No 500 during handshake; run `pnpm verify:local` (step 3) or check server logs for "ws connect". |
| 4 | Create room works | Click "Создать комнату" and see waiting room + room code; or `pnpm verify:local` (step 4). |
| 5 | Join room works | Second tab: enter room code, "Войти в комнату"; or `pnpm verify:local` (step 5). |
| 6 | Second tab reaches same room | Both tabs show same waiting room and players; or verify script asserts same `roomId`. |
| 7 | No server 500 on WS handshake | Server logs show "ws connect" and no 500; verify script step 3 passes. |

## Definition of done

The task is done **only if all** of the following are true:

| # | Criterion | How it is satisfied |
|---|-----------|---------------------|
| 1 | Local backend is reachable | Server listens on `http://127.0.0.1:8080`; `GET /health` returns 200. Run `pnpm verify:local` to confirm. |
| 2 | Local frontend is reachable | `pnpm --filter ./apps/web dev` serves the app at **http://localhost:5173**. |
| 3 | Pressing "Create room" triggers real backend flow | Frontend calls `POST /auth/dev`, then opens WebSocket with auth token, then sends `room.create`; server handles it and responds with `room.created`. |
| 4 | Pressing "Join room" triggers real backend flow | Second client auths, connects WS, sends `room.join` with `roomId`; server responds with `room.joined` and broadcasts `room.players`. |
| 5 | Server logs show those requests/connections | In dev, server logs: `auth bootstrap: dev`, `ws connect`, `room create` / `room join`, `ws disconnect`. |
| 6 | Room state is shared between clients | `GameRoom.broadcastPlayers()` and `broadcast(room.started)` send the same room/game state to all connected clients in the room. |
| 7 | App is no longer stuck before entering a room | WebSocket handler uses correct `(socket, request)` signature; server sends `room.created` / `room.joined`; frontend `applyJoinedRoom` sets `roomStatus: "waiting"` and shows `WaitingRoomScreen`. |

## 1. Install and build

```bash
pnpm install
pnpm build
```

Both should complete without errors.

## 2. Start server

```bash
pnpm --filter ./apps/server dev
```

Server should listen on `http://127.0.0.1:8080` (or the port in `apps/server/.env`). Leave it running.

## 3. Start web app

In another terminal:

```bash
pnpm --filter ./apps/web dev
```

App should be available at **http://localhost:5173**.

## 4. Backend verification (no browser)

With the server running:

```bash
pnpm verify:local
```

This checks:

- **Health** — `GET /health` returns 200
- **POST /auth/dev** — succeeds and returns a token
- **WebSocket /ws** — connects with that token (no 500 on handshake)
- **Create room** — first client sends `room.create`, receives `room.created`
- **Join room** — second client auths, connects, sends `room.join` with that room id, receives `room.joined`
- **Second tab same room** — second client’s `room.joined.room.roomId` matches the created room

Run from repo root so `ws` resolves from the server package. If the server is not running, the script will exit with code 1.

## 5. Full E2E in the browser

1. Open **http://localhost:5173**.
2. **Create room:** enter a name, click "Создать комнату". You should see the waiting room and a room code.
3. **Join room:** open a second tab, open http://localhost:5173, enter the same room code, click "Войти в комнату". Both tabs should show the same waiting room and player list.
4. **State visible:** both clients show the same room and players.
5. **First multiplayer step:** in the first tab click "Старт: простой" (or another start). Both tabs should show the game starting; at least the first multiplayer interaction is possible.

If any step fails, fix the underlying cause (do not document around it).
