// Local verification: health, auth, WS create room, second client join same room. Run: pnpm --filter @durak/server verify:local
// Requires server running on http://127.0.0.1:8080 with APP_ENV=development (allowDevAuth). Use "pnpm exec node" so ws resolves.
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const WebSocket = require("ws");

const API = "http://127.0.0.1:8080";
const WS_URL = "ws://127.0.0.1:8080/ws";

async function main() {
  console.log("1. Health...");
  const health = await fetch(`${API}/health`).then((r) => r.json());
  if (!health.ok) throw new Error("Health failed");
  console.log("   ok", health.service);

  console.log("2. POST /auth/dev...");
  const auth1 = await fetch(`${API}/auth/dev`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ playerName: "Alice", clientId: "verify-a-" + Date.now() }),
  }).then((r) => r.json());
  if (!auth1.token) {
    if (auth1.code === "AUTH_UNAVAILABLE" || (auth1.message && auth1.message.includes("Dev auth is disabled"))) {
      console.error("\nDev auth is disabled. The server is running with APP_ENV=production (or allowDevAuth=false).");
      console.error("For local verification, run the server with APP_ENV=development:");
      console.error("  - In apps/server/.env set: APP_ENV=development");
      console.error("  - Restart the server, then run: pnpm verify:local\n");
      process.exit(1);
    }
    throw new Error("Auth failed: " + JSON.stringify(auth1));
  }
  console.log("   ok");

  console.log("3. WebSocket /ws connect...");
  const ws1 = new WebSocket(WS_URL, ["durak.v1", "auth." + auth1.token]);
  await new Promise((resolve, reject) => {
    ws1.on("open", () => resolve());
    ws1.on("error", (e) => reject(e));
    setTimeout(() => reject(new Error("WS open timeout")), 5000);
  });
  console.log("   ok (no 500 on handshake)");

  console.log("3b. First server message (connection.ready)...");
  const firstMessage = await new Promise((resolve, reject) => {
    ws1.once("message", (data) => resolve(JSON.parse(data.toString())));
    setTimeout(() => reject(new Error("connection.ready timeout")), 3000);
  });
  if (firstMessage.type !== "connection.ready") {
    throw new Error("Expected connection.ready, got: " + firstMessage.type);
  }
  console.log("   ok", firstMessage.type, firstMessage.user ? "(with user)" : "");

  console.log("4. Create room...");
  const created = await new Promise((resolve, reject) => {
    ws1.once("message", (data) => {
      const m = JSON.parse(data.toString());
      if (m.type === "room.created") resolve(m);
      else reject(new Error("Unexpected: " + m.type));
    });
    ws1.send(JSON.stringify({ type: "room.create" }));
    setTimeout(() => reject(new Error("room.created timeout")), 5000);
  });
  const roomId = created.room.roomId;
  console.log("   ok room", roomId);

  console.log("5. Second client: auth + connect + join same room...");
  const auth2 = await fetch(`${API}/auth/dev`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ playerName: "Bob", clientId: "verify-b-" + Date.now() }),
  }).then((r) => r.json());
  if (!auth2.token) throw new Error("Second auth failed: " + JSON.stringify(auth2));

  const ws2 = new WebSocket(WS_URL, ["durak.v1", "auth." + auth2.token]);
  await new Promise((resolve, reject) => {
    ws2.on("open", () => resolve());
    ws2.on("error", (e) => reject(e));
    setTimeout(() => reject(new Error("WS2 open timeout")), 5000);
  });

  const joined = await new Promise((resolve, reject) => {
    ws2.once("message", (data) => {
      const m = JSON.parse(data.toString());
      if (m.type === "room.joined") resolve(m);
      else reject(new Error("Unexpected: " + m.type));
    });
    ws2.send(JSON.stringify({ type: "room.join", roomId }));
    setTimeout(() => reject(new Error("room.joined timeout")), 5000);
  });
  if (joined.room.roomId !== roomId) throw new Error("Second tab different room");
  console.log("   ok second tab in same room", joined.room.roomId);

  ws1.close();
  ws2.close();
  console.log("All steps passed. App at http://localhost:5173 - create/join and second tab same room verified.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
