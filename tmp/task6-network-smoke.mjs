const API_BASE = "http://127.0.0.1:8080";
const WS_URL = "ws://127.0.0.1:8080/ws";
const WEB_URL = "http://localhost:5173";

function waitForOpen(socket) {
  return new Promise((resolve, reject) => {
    const onOpen = () => {
      cleanup();
      resolve();
    };
    const onError = (event) => {
      cleanup();
      reject(new Error(`WebSocket open failed: ${event?.message ?? "unknown error"}`));
    };
    const cleanup = () => {
      socket.removeEventListener("open", onOpen);
      socket.removeEventListener("error", onError);
    };
    socket.addEventListener("open", onOpen);
    socket.addEventListener("error", onError);
  });
}

function waitForMessage(socket, predicate, timeoutMs = 15000) {
  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      cleanup();
      reject(new Error("Timed out waiting for websocket message"));
    }, timeoutMs);

    const onMessage = (event) => {
      const data = JSON.parse(event.data);
      if (!predicate(data)) {
        return;
      }
      cleanup();
      resolve(data);
    };

    const onClose = () => {
      cleanup();
      reject(new Error("WebSocket closed before expected message"));
    };

    const cleanup = () => {
      clearTimeout(timeoutId);
      socket.removeEventListener("message", onMessage);
      socket.removeEventListener("close", onClose);
    };

    socket.addEventListener("message", onMessage);
    socket.addEventListener("close", onClose);
  });
}

function sendJson(socket, payload) {
  socket.send(JSON.stringify(payload));
}

async function authDev(playerName, clientId) {
  const response = await fetch(`${API_BASE}/auth/dev`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      Origin: WEB_URL,
    },
    body: JSON.stringify({ playerName, clientId }),
  });
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(`Auth failed for ${playerName}: ${JSON.stringify(payload)}`);
  }
  return payload;
}

function connectAuthorizedWebSocket(authToken) {
  return new WebSocket(WS_URL, ["durak.v1", `auth.${authToken}`]);
}

async function main() {
  let frontendReachable = false;
  try {
    const webResponse = await fetch(WEB_URL, { signal: AbortSignal.timeout(3000) });
    frontendReachable = webResponse.ok;
  } catch (_) {
    // Web app optional for backend-only verification
  }

  const healthResponse = await fetch(`${API_BASE}/health`);
  const health = await healthResponse.json();
  if (!healthResponse.ok) {
    throw new Error(`Backend health failed: ${healthResponse.status}`);
  }

  const aliceAuth = await authDev("Alice", `task6-alice-${Date.now()}`);
  const bobAuth = await authDev("Bob", `task6-bob-${Date.now()}`);

  const aliceSocket = connectAuthorizedWebSocket(aliceAuth.token);
  await waitForOpen(aliceSocket);
  sendJson(aliceSocket, { type: "room.create" });
  const created = await waitForMessage(aliceSocket, (message) => message.type === "room.created");
  const roomId = created.room.roomId;

  const bobSocket = connectAuthorizedWebSocket(bobAuth.token);
  await waitForOpen(bobSocket);
  sendJson(bobSocket, { type: "room.join", roomId });
  const [joined, playersForAlice] = await Promise.all([
    waitForMessage(bobSocket, (message) => message.type === "room.joined"),
    waitForMessage(
      aliceSocket,
      (message) => message.type === "room.players" && message.room.roomId === roomId
    ),
  ]);

  sendJson(aliceSocket, { type: "room.start", roomId, mode: "simple" });
  const [startedForAlice, startedForBob] = await Promise.all([
    waitForMessage(aliceSocket, (message) => message.type === "room.started"),
    waitForMessage(bobSocket, (message) => message.type === "room.started"),
  ]);

  const alicePlayers = playersForAlice.room.players.map((player) => player.name).sort();
  const bobPlayers = joined.room.players.map((player) => player.name).sort();

  const result = {
    frontendReachable,
    backendHealth: health,
    webSocketUrl: WS_URL,
    createRoom: {
      ok: created.type === "room.created",
      roomId,
      hostName: aliceAuth.user.displayName,
    },
    joinRoom: {
      ok: joined.type === "room.joined",
      guestName: bobAuth.user.displayName,
    },
    sharedRoomRoster: {
      sameRoomId: playersForAlice.room.roomId === joined.room.roomId,
      samePlayers: JSON.stringify(alicePlayers) === JSON.stringify(bobPlayers),
      players: alicePlayers,
    },
    sharedGameState: {
      sameMatchId: startedForAlice.state.matchId === startedForBob.state.matchId,
      sameVersion: startedForAlice.state.version === startedForBob.state.version,
      sameMode: startedForAlice.state.mode === startedForBob.state.mode,
      matchId: startedForAlice.state.matchId,
      version: startedForAlice.state.version,
      mode: startedForAlice.state.mode,
    },
  };

  aliceSocket.close();
  bobSocket.close();
  console.log(JSON.stringify(result, null, 2));
}

await main();
