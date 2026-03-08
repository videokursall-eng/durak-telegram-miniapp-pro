import test from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";

import { buildApp } from "../dist/app.js";
import { AuthSessionStore } from "../dist/auth/sessionStore.js";
import { verifyTelegramInitData } from "../dist/auth/verifyTelegramInitData.js";
import {
  createAuthSubprotocols,
  extractAuthTokenFromSubprotocolHeader,
} from "../dist/auth/wsAuth.js";

const BOT_TOKEN = "123456:TEST_BOT_TOKEN";
const NOW_MS = Date.UTC(2026, 2, 6, 12, 0, 0);

function createTelegramInitData(userOverrides = {}, authDateSeconds = Math.floor(NOW_MS / 1000)) {
  const user = {
    id: 42,
    first_name: "Alice",
    username: "alice",
    ...userOverrides,
  };

  const params = new URLSearchParams();
  params.set("auth_date", String(authDateSeconds));
  params.set("query_id", "AAEAAQ");
  params.set("user", JSON.stringify(user));

  const dataCheckString = [...params.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");

  const secret = createHmac("sha256", "WebAppData").update(BOT_TOKEN).digest();
  const hash = createHmac("sha256", secret).update(dataCheckString).digest("hex");
  params.set("hash", hash);

  return params.toString();
}

async function startTestApp() {
  const app = await buildApp({
    telegramBotToken: BOT_TOKEN,
    telegramInitDataTtlSeconds: 3600,
    authTokenTtlSeconds: 3600,
  });

  await app.listen({ port: 0, host: "127.0.0.1" });
  const address = app.server.address();
  if (!address || typeof address === "string") {
    throw new Error("Failed to resolve test server address");
  }

  return {
    app,
    baseHttpUrl: `http://127.0.0.1:${address.port}`,
    baseWsUrl: `ws://127.0.0.1:${address.port}/ws`,
  };
}

async function startTestAppWithoutDevAuth() {
  const app = await buildApp({
    telegramBotToken: BOT_TOKEN,
    telegramInitDataTtlSeconds: 3600,
    authTokenTtlSeconds: 3600,
    allowDevAuth: false,
  });

  await app.listen({ port: 0, host: "127.0.0.1" });
  const address = app.server.address();
  if (!address || typeof address === "string") {
    throw new Error("Failed to resolve test server address");
  }

  return {
    app,
    baseHttpUrl: `http://127.0.0.1:${address.port}`,
  };
}

function waitForWebSocketOpen(socket) {
  return new Promise((resolve, reject) => {
    socket.addEventListener("open", () => resolve(undefined), { once: true });
    socket.addEventListener("error", (event) => reject(event.error ?? new Error("WS error")), {
      once: true,
    });
  });
}

function waitForWebSocketMessage(socket) {
  return new Promise((resolve, reject) => {
    socket.addEventListener(
      "message",
      (event) => {
        resolve(JSON.parse(String(event.data)));
      },
      { once: true }
    );
    socket.addEventListener("error", (event) => reject(event.error ?? new Error("WS error")), {
      once: true,
    });
  });
}

function waitForWebSocketClose(socket) {
  return new Promise((resolve) => {
    socket.addEventListener("close", () => resolve(undefined), { once: true });
  });
}

test("verifyTelegramInitData accepts valid payload", () => {
  const initData = createTelegramInitData();
  const user = verifyTelegramInitData(initData, {
    botToken: BOT_TOKEN,
    nowMs: NOW_MS,
  });

  assert.equal(user.telegramUserId, "42");
  assert.equal(user.displayName, "Alice");
  assert.equal(user.username, "alice");
});

test("verifyTelegramInitData rejects invalid signature", () => {
  const initData = `${createTelegramInitData()}broken`;

  assert.throws(() =>
    verifyTelegramInitData(initData, {
      botToken: BOT_TOKEN,
      nowMs: NOW_MS,
    })
  );
});

test("verifyTelegramInitData rejects expired auth_date", () => {
  const initData = createTelegramInitData({}, Math.floor(NOW_MS / 1000) - 7200);

  assert.throws(() =>
    verifyTelegramInitData(initData, {
      botToken: BOT_TOKEN,
      nowMs: NOW_MS,
      ttlSeconds: 60,
    })
  );
});

test("verifyTelegramInitData rejects malformed user payload", () => {
  const params = new URLSearchParams(createTelegramInitData());
  params.set("user", "{broken-json");
  const dataCheckString = [...params.entries()]
    .filter(([key]) => key !== "hash")
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");
  const secret = createHmac("sha256", "WebAppData").update(BOT_TOKEN).digest();
  params.set("hash", createHmac("sha256", secret).update(dataCheckString).digest("hex"));

  assert.throws(() =>
    verifyTelegramInitData(params.toString(), {
      botToken: BOT_TOKEN,
      nowMs: NOW_MS,
    })
  );
});

test("AuthSessionStore verifies and expires tokens", () => {
  let nowMs = NOW_MS;
  const store = new AuthSessionStore({
    ttlSeconds: 1,
    nowMs: () => nowMs,
  });

  const session = store.issue({
    telegramUserId: "42",
    username: "alice",
    firstName: "Alice",
    lastName: null,
    photoUrl: null,
    displayName: "Alice",
  });

  assert.equal(store.verify(session.token)?.user.telegramUserId, "42");
  nowMs += 2000;
  assert.equal(store.verify(session.token), null);
});

test("wsAuth extracts token from subprotocol header", () => {
  const protocols = createAuthSubprotocols("token-123");
  assert.deepEqual(protocols, ["durak.v1", "auth.token-123"]);
  assert.equal(
    extractAuthTokenFromSubprotocolHeader("durak.v1, auth.token-123"),
    "token-123"
  );
});

test("POST /auth/telegram returns trusted token and user", async () => {
  const { app, baseHttpUrl } = await startTestApp();

  try {
    const response = await fetch(`${baseHttpUrl}/auth/telegram`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        initData: createTelegramInitData(),
      }),
    });

    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(typeof payload.token, "string");
    assert.equal(payload.user.telegramUserId, "42");
  } finally {
    await app.close();
  }
});

test("POST /auth/telegram ignores body.user and body.telegramUserId; identity comes only from validated initData", async () => {
  const { app, baseHttpUrl } = await startTestApp();

  try {
    // initData signs user id 42 (Alice). Body also sends fake user 999; server must return 42.
    const response = await fetch(`${baseHttpUrl}/auth/telegram`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        initData: createTelegramInitData(),
        user: { id: 999, first_name: "Fake" },
        telegramUserId: "999",
      }),
    });

    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.user.telegramUserId, "42");
    assert.equal(payload.user.displayName, "Alice");
  } finally {
    await app.close();
  }
});

test("POST /auth/dev returns 404 when allowDevAuth is false", async () => {
  const { app, baseHttpUrl } = await startTestAppWithoutDevAuth();

  try {
    const response = await fetch(`${baseHttpUrl}/auth/dev`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        playerName: "Dev",
        clientId: "test-client",
      }),
    });

    assert.equal(response.status, 404);
    const payload = await response.json();
    assert.equal(payload.code, "AUTH_UNAVAILABLE");
  } finally {
    await app.close();
  }
});

test("websocket without token is rejected", async () => {
  const { app, baseWsUrl } = await startTestApp();

  try {
    const socket = new WebSocket(baseWsUrl);
    const firstMessage = await waitForWebSocketMessage(socket);
    assert.equal(firstMessage.type, "error");
    assert.equal(firstMessage.code, "AUTH_REQUIRED");
    await waitForWebSocketClose(socket);
  } finally {
    await app.close();
  }
});

test("websocket with invalid token is rejected", async () => {
  const { app, baseWsUrl } = await startTestApp();

  try {
    const socket = new WebSocket(baseWsUrl, createAuthSubprotocols("invalid-token"));
    const firstMessage = await waitForWebSocketMessage(socket);
    assert.equal(firstMessage.type, "error");
    assert.equal(firstMessage.code, "AUTH_REQUIRED");
    await waitForWebSocketClose(socket);
  } finally {
    await app.close();
  }
});

test("websocket with valid token can create room", async () => {
  const { app, baseHttpUrl, baseWsUrl } = await startTestApp();

  try {
    const authResponse = await fetch(`${baseHttpUrl}/auth/telegram`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        initData: createTelegramInitData(),
      }),
    });
    const authPayload = await authResponse.json();

    const socket = new WebSocket(baseWsUrl, createAuthSubprotocols(authPayload.token));
    await waitForWebSocketOpen(socket);
    socket.send(JSON.stringify({ type: "room.create" }));

    const message = await waitForWebSocketMessage(socket);
    assert.equal(message.type, "room.created");
    assert.equal(message.room.players.length, 1);
    assert.equal(typeof message.sessionToken, "string");

    socket.close();
    await waitForWebSocketClose(socket);
  } finally {
    await app.close();
  }
});
