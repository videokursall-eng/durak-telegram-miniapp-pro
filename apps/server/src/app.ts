import Fastify, { type FastifyReply } from "fastify";
import websocket from "@fastify/websocket";
import fastifyStatic from "@fastify/static";
import path from "node:path";
import fs from "node:fs";
import {
  type ClientToServerMessage,
  type ErrorMessage,
} from "@durak/shared";
import { AuthSessionStore } from "./auth/sessionStore.js";
import { verifyTelegramInitData } from "./auth/verifyTelegramInitData.js";
import { extractAuthTokenFromSubprotocolHeader, extractAuthTokenFromQuery } from "./auth/wsAuth.js";
import { createInMemoryPersistence } from "./persistence/memory/InMemoryPersistence.js";
import { RoomRegistry } from "./rooms/RoomRegistry.js";
import type { TelegramUserIdentity } from "./auth/types.js";
import { GameRoom } from "./rooms/GameRoom.js";
import { ReconnectService } from "./services/ReconnectService.js";
import { RoomLifecycleService } from "./services/RoomLifecycleService.js";
import { readAppConfig } from "./config.js";
import { createRoomRateLimiters } from "./lib/rateLimit.js";

type SocketConnection = {
  send: (payload: string) => unknown;
  close: (code?: number, reason?: string) => unknown;
  on: (event: string, listener: (...args: any[]) => void) => unknown;
};

type BuildAppOptions = {
  telegramBotToken?: string | null;
  authTokenTtlSeconds?: number;
  telegramInitDataTtlSeconds?: number;
  trustProxy?: boolean;
  appEnv?: string;
  deployPlatform?: string | null;
  allowDevAuth?: boolean;
  corsAllowedOrigins?: string[];
  /** Absolute path to frontend build (e.g. apps/web/dist). If set and folder exists, serves static + SPA fallback. */
  staticRoot?: string | null;
};

const DEV_PLAYER_NAME_PREFIX = "[dev] ";
const AUTH_TELEGRAM_PATH = "/auth/telegram";
const AUTH_DEV_PATH = "/auth/dev";
const HEALTH_PATH = "/health";
const HEALTHZ_PATH = "/healthz";
const READYZ_PATH = "/readyz";
const WS_PATH = "/ws";

/** Request body for POST /auth/telegram. Only initData is used for auth; any other fields (e.g. clientMetadata) are ignored for trust. */
type AuthTelegramBody = {
  initData: string;
  /** Optional client metadata for logging only; never used for identity or auth. */
  clientMetadata?: unknown;
};

/** Full URL for /ws upgrade; key by Fastify request (same ref in onRequest and WS handler). */
const wsFullUrlByRequest = new WeakMap<object, string>();
/** Same URL keyed by Node IncomingMessage (request.raw) so WS handler can read it even if request ref differs. */
const wsFullUrlByRaw = new WeakMap<object, string>();
/** URL keyed by TCP socket (same ref in upgrade event and ws._socket in handler). */
const wsFullUrlByTcpSocket = new WeakMap<object, string>();

function normalizeDevPlayerName(name: string | undefined) {
  const rawValue = name?.trim() || "Local Player";
  if (rawValue.startsWith(DEV_PLAYER_NAME_PREFIX)) {
    return rawValue.slice(0, 24);
  }

  const allowedBaseLength = Math.max(1, 24 - DEV_PLAYER_NAME_PREFIX.length);
  return `${DEV_PLAYER_NAME_PREFIX}${rawValue.slice(0, allowedBaseLength)}`;
}

function normalizeDevClientId(clientId: string | undefined) {
  const value = clientId?.trim();
  if (!value) {
    throw new Error("Dev clientId is required");
  }

  return value.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 64);
}

function buildRequestError(
  message: string,
  code = "REQUEST_REJECTED"
): ErrorMessage {
  return {
    type: "error",
    code,
    message,
  };
}

function resolveSocketConnection(connection: unknown): SocketConnection | null {
  if (connection == null || typeof connection !== "object") {
    return null;
  }
  const c = connection as Record<string, unknown>;
  const hasSend = typeof c.send === "function";
  const hasClose = typeof c.close === "function";
  const hasOn = typeof c.on === "function";

  if (hasSend && hasClose && hasOn) {
    return connection as SocketConnection;
  }

  if (hasSend && hasClose) {
    return {
      send: (payload: string) => (c.send as (p: string) => unknown)(payload),
      close: (code?: number, reason?: string) => (c.close as (code?: number, reason?: string) => unknown)(code, reason),
      on: () => connection,
    } as SocketConnection;
  }

  // ws WebSocket: at least .send required; .close/.on may be on prototype
  if (hasSend) {
    return {
      send: (payload: string) => (c.send as (p: string) => unknown)(payload),
      close: hasClose ? (code?: number, reason?: string) => (c.close as (code?: number, reason?: string) => unknown)(code, reason) : () => undefined,
      on: hasOn ? (event: string, listener: (...args: unknown[]) => void) => (c.on as (e: string, l: (...a: unknown[]) => void) => unknown)(event, listener) : () => connection,
    } as SocketConnection;
  }

  if (
    c.socket != null &&
    typeof c.socket === "object" &&
    typeof (c.socket as Record<string, unknown>).send === "function" &&
    typeof (c.socket as Record<string, unknown>).close === "function"
  ) {
    return c.socket as SocketConnection;
  }

  return null;
}

/** Safely send an error and close the socket; never throws. Supports the raw @fastify/websocket (socket, request) socket shape. */
function safeCloseUnauthorized(connection: unknown, messageOrError: string | ErrorMessage) {
  const error: ErrorMessage =
    typeof messageOrError === "string"
      ? buildRequestError(messageOrError, "AUTH_REQUIRED")
      : messageOrError;
  const conn = resolveSocketConnection(connection);
  if (conn) {
    const errorPayload = JSON.stringify(error);
    try {
      conn.send(errorPayload);
    } catch (_) {
      // ignore
    }
    try {
      conn.close(4401, error.code ?? "Unauthorized");
    } catch (_) {
      // ignore
    }
    return;
  }
  // Fallback: connection shape not recognized; try to close anyway to avoid leaving unauthorized socket open.
  if (connection != null && typeof connection === "object" && typeof (connection as Record<string, unknown>).close === "function") {
    try {
      ((connection as Record<string, unknown>).close as (code?: number, reason?: string) => void)(4401, error.code ?? "Unauthorized");
    } catch (_) {
      // ignore
    }
  }
}

/** Safely send an error to the socket; never throws. */
function safeReplyWithError(connection: unknown, error: ErrorMessage) {
  const conn = resolveSocketConnection(connection);
  if (!conn) {
    return;
  }
  const payload = JSON.stringify(error);
  try {
    conn.send(payload);
  } catch (_) {
    // ignore
  }
}

function isOriginAllowed(origin: string, allowedOrigins: string[]) {
  return allowedOrigins.includes(origin);
}

function applyCorsHeaders(reply: FastifyReply, origin: string) {
  reply.header("Access-Control-Allow-Origin", origin);
  reply.header("Vary", "Origin");
  reply.header("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  reply.header("Access-Control-Allow-Headers", "content-type,sec-websocket-protocol");
}

function getRequestPath(url: string) {
  return url.split("?")[0] ?? url;
}

/**
 * Prevent @fastify/websocket's onResponse hook from destroying the upgrade socket.
 * The plugin stores the raw TCP socket on request.raw[kWs] and calls .destroy() in onResponse,
 * which closes the WebSocket immediately after the handler returns. Replace that reference
 * with a no-op so the real socket (now owned by the WebSocket) stays open.
 * Used when we cannot rely on a pnpm patch (e.g. patch fails on clean VPS install).
 */
function preventWsSocketDestroy(raw: unknown) {
  if (raw == null || typeof raw !== "object") {
    return;
  }
  const obj = raw as Record<symbol, unknown>;
  const symbols = Object.getOwnPropertySymbols(obj);
  for (const sym of symbols) {
    const val = obj[sym];
    if (
      val != null &&
      typeof val === "object" &&
      "destroy" in val &&
      typeof (val as { destroy: () => void }).destroy === "function"
    ) {
      obj[sym] = { destroy: () => {} };
      return;
    }
  }
}

function getHeader(
  request:
    | {
        headers?: Record<string, string | string[] | undefined>;
        raw?: {
          headers?: Record<string, string | string[] | undefined>;
          rawHeaders?: string[];
        };
      }
    | null
    | undefined,
  name: string
): string | string[] | undefined {
  if (request == null || typeof request !== "object") {
    return undefined;
  }
  const lower = name.toLowerCase();
  const fromRequest = request.headers?.[lower];
  if (fromRequest !== undefined && fromRequest !== null) {
    return fromRequest;
  }
  const fromRaw = request.raw?.headers?.[lower];
  if (fromRaw !== undefined && fromRaw !== null) {
    return fromRaw;
  }
  if (request.raw?.headers && typeof request.raw.headers === "object") {
    const rawHeaders = request.raw.headers as Record<string, string | string[] | undefined>;
    for (const key of Object.keys(rawHeaders)) {
      if (key.toLowerCase() === lower) {
        return rawHeaders[key];
      }
    }
  }
  // Node IncomingMessage.rawHeaders: [key1, value1, key2, value2, ...]; some proxies/ws stacks only expose this
  const rawArr = request.raw?.rawHeaders;
  if (Array.isArray(rawArr)) {
    for (let i = 0; i < rawArr.length - 1; i += 2) {
      if (String(rawArr[i]).toLowerCase() === lower) {
        return rawArr[i + 1];
      }
    }
  }
  return undefined;
}

/** Parse query string from request URL; keys lowercased. Safe for missing or invalid url. */
function getQueryParams(request: { url?: string } | null | undefined): Record<string, string> {
  if (request == null || typeof request !== "object") {
    return {};
  }
  return getQueryParamsFromUrl(typeof request.url === "string" ? request.url : "");
}

function getQueryParamsFromUrl(url: string): Record<string, string> {
  const q = url.includes("?") ? url.slice(url.indexOf("?") + 1) : "";
  const out: Record<string, string> = {};
  for (const part of q.split("&")) {
    const eq = part.indexOf("=");
    const k = (eq >= 0 ? part.slice(0, eq) : part).trim().toLowerCase();
    let v = eq >= 0 ? part.slice(eq + 1).trim() : "";
    if (k && v) {
      try {
        v = decodeURIComponent(v);
      } catch {
        // leave v as-is if decoding fails
      }
      out[k] = v;
    } else if (k) {
      out[k] = "";
    }
  }
  return out;
}

type WsAuthDiagnostics = {
  source: "protocol" | "query" | "cookie" | "header" | "none";
  rejectReason?: "missing" | "invalid_or_expired";
  sourcesChecked: { query: boolean; protocol: boolean; cookie: boolean; header: boolean };
};

function getWsAuthDiagnostics(
  request: { url?: string; headers?: Record<string, string | string[] | undefined>; raw?: { headers?: Record<string, string | string[] | undefined> } },
  authToken: string | null,
  authAccepted: boolean
): WsAuthDiagnostics {
  const query = getQueryParams(request);
  const hasQueryAuth = Boolean(query.token ?? query.auth);
  const protocolHeader = getHeader(request, "sec-websocket-protocol");
  const hasProtocolValue = protocolHeader != null && String(protocolHeader).trim().length > 0;
  const cookieHeader = getHeader(request, "cookie");
  const hasCookie = cookieHeader != null && String(cookieHeader).trim().length > 0;
  const authHeader = getHeader(request, "authorization");
  const hasAuthHeader = authHeader != null && String(authHeader).trim().length > 0;

  const sourcesChecked = {
    query: hasQueryAuth,
    protocol: hasProtocolValue,
    cookie: hasCookie,
    header: hasAuthHeader,
  };

  if (authAccepted && authToken) {
    return { source: "protocol", sourcesChecked };
  }
  if (authToken) {
    return { source: "protocol", rejectReason: "invalid_or_expired", sourcesChecked };
  }
  return {
    source: "none",
    rejectReason: "missing",
    sourcesChecked,
  };
}

function shouldLogDevHttpRequest(path: string) {
  return (
    path === AUTH_TELEGRAM_PATH ||
    path === AUTH_DEV_PATH ||
    path === HEALTH_PATH ||
    path === HEALTHZ_PATH ||
    path === READYZ_PATH ||
    path === WS_PATH
  );
}

export async function buildApp(options: BuildAppOptions = {}) {
  const defaults = readAppConfig();
  const telegramBotToken = options.telegramBotToken ?? defaults.telegramBotToken;
  const authTokenTtlSeconds = options.authTokenTtlSeconds ?? defaults.authTokenTtlSeconds;
  const initDataTtlSeconds =
    options.telegramInitDataTtlSeconds ?? defaults.telegramInitDataTtlSeconds;
  const trustProxy = options.trustProxy ?? defaults.trustProxy;
  const appEnv = options.appEnv ?? defaults.appEnv;
  const deployPlatform = options.deployPlatform ?? defaults.deployPlatform;
  const allowDevAuth = options.allowDevAuth ?? defaults.allowDevAuth;
  const corsAllowedOrigins = options.corsAllowedOrigins ?? defaults.corsAllowedOrigins;
  const isDevRuntime = appEnv !== "production";

  const app = Fastify({
    logger: true,
    trustProxy,
  });
  const registry = new RoomRegistry();
  const limiters = createRoomRateLimiters();
  const persistence = createInMemoryPersistence();
  const roomLifecycle = new RoomLifecycleService(persistence);
  const reconnectService = new ReconnectService(persistence, roomLifecycle);
  const authSessions = new AuthSessionStore({
    ttlSeconds: authTokenTtlSeconds,
  });

  void app.register(websocket);

  // Capture full URL for /ws as soon as upgrade fires (before Fastify may normalize url).
  // Store on TCP socket (handler receives WebSocket; ws._socket === this socket) and on rawRequest.
  const WS_FULL_URL_KEY = "__wsFullUrl" as const;
  app.addHook("onReady", () => {
    const server = (app as { server?: { prependListener?: (ev: string, fn: (req: unknown, socket: unknown, head: unknown) => void) => void } }).server;
    if (server && typeof server.prependListener === "function") {
      server.prependListener("upgrade", (rawRequest: unknown, socket: unknown, _head: unknown) => {
        const req = rawRequest as { url?: string } | null | undefined;
        const url = req?.url;
        const path = getRequestPath(typeof url === "string" ? url : "");
        if (path === WS_PATH && typeof url === "string" && url.length > 0) {
          if (rawRequest != null && typeof rawRequest === "object") {
            (rawRequest as Record<string, string>)[WS_FULL_URL_KEY] = url;
            wsFullUrlByRaw.set(rawRequest as object, url);
          }
          if (socket != null && typeof socket === "object") {
            wsFullUrlByTcpSocket.set(socket as object, url);
          }
        }
      });
    }
  });

  app.addHook("onRequest", async (request, reply) => {
    const rawReq = request.raw as { url?: string } | undefined;
    const rawUrl = rawReq?.url ?? request.url ?? "";
    const requestPath = getRequestPath(rawUrl);
    if (requestPath === WS_PATH && rawUrl) {
      wsFullUrlByRequest.set(request as object, rawUrl);
      if (rawReq && typeof rawReq === "object") {
        wsFullUrlByRaw.set(rawReq as object, rawUrl);
      }
    }
    const origin = request.headers.origin;
    if (origin && isOriginAllowed(origin, corsAllowedOrigins)) {
      applyCorsHeaders(reply, origin);
    }

    if (isDevRuntime && shouldLogDevHttpRequest(requestPath)) {
      request.log.info(
        {
          method: request.method,
          path: requestPath,
          origin: origin ?? null,
        },
        "Incoming dev HTTP request"
      );
    }

    if (request.method === "OPTIONS") {
      reply.code(204).send();
    }
  });

  app.get(HEALTH_PATH, async (request) => {
    const uptimeSeconds = process.uptime();
    return {
      status: "ok",
      ok: true,
      service: "durak-server",
      env: appEnv,
      deployPlatform,
      uptime: Math.round(uptimeSeconds * 1000),
      uptimeSeconds: Math.round(uptimeSeconds),
      timestamp: Date.now(),
      protocol: request.protocol,
      websocketPath: WS_PATH,
    };
  });

  app.get(HEALTHZ_PATH, async () => ({
    ok: true,
  }));

  app.get(READYZ_PATH, async () => ({
    ok: true,
    checks: {
      telegramBotToken: Boolean(telegramBotToken),
      authSessions: "memory",
      persistence: "memory",
      reverseProxyAware: trustProxy,
    },
  }));

  app.post(AUTH_TELEGRAM_PATH, async (request, reply) => {
    // Production-grade Telegram Mini App auth. We only trust identity from server-validated initData
    // (signature + TTL verified with TELEGRAM_BOT_TOKEN). We never trust initDataUnsafe, nor a
    // user id or user object sent separately in the body; any such fields are ignored.
    const body = request.body as Partial<AuthTelegramBody> | undefined;

    if (isDevRuntime) {
      request.log.info("Telegram auth request received");
    }

    try {
      if (!telegramBotToken) {
        reply.status(503);
        return buildRequestError(
          "Telegram auth is unavailable in this environment",
          "AUTH_UNAVAILABLE"
        );
      }

      const initData = body?.initData?.trim();
      if (!initData) {
        reply.status(400);
        return buildRequestError("Telegram initData is required", "AUTH_INVALID");
      }

      const user = verifyTelegramInitData(initData, {
        botToken: telegramBotToken,
        ttlSeconds: initDataTtlSeconds,
      });
      roomLifecycle.upsertAuthenticatedUser(user);
      const session = authSessions.issue(user);

      request.log.info(
        {
          telegramUserId: user.telegramUserId,
        },
        "Telegram auth success"
      );
      if (isDevRuntime) {
        request.log.info(
          { telegramUserId: user.telegramUserId },
          "user id after validation"
        );
        request.log.info("auth bootstrap: telegram");
      }

      return {
        token: session.token,
        user,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Telegram auth failed";
      request.log.warn({ err: error }, "Telegram auth failed");
      reply.status(401);
      return buildRequestError(message, "AUTH_INVALID");
    }
  });

  app.post(AUTH_DEV_PATH, async (request, reply) => {
    // Development only: when allowDevAuth (APP_ENV=development), issue a session so /ws works without Telegram.
    // Production auth path is POST /auth/telegram only; do not enable allowDevAuth in production.
    if (!allowDevAuth) {
      reply.status(404);
      return buildRequestError("Dev auth is disabled", "AUTH_UNAVAILABLE");
    }

    const body = request.body as { playerName?: string; clientId?: string } | undefined;

    try {
      const clientId = normalizeDevClientId(body?.clientId);
      const playerName = normalizeDevPlayerName(body?.playerName);
      const user: TelegramUserIdentity = {
        telegramUserId: `dev_${clientId}`,
        username: null,
        firstName: playerName,
        lastName: null,
        photoUrl: null,
        displayName: playerName,
      };

      roomLifecycle.upsertAuthenticatedUser(user);
      const session = authSessions.issue(user);
      request.log.info({ devClientId: clientId, playerName }, "Issued local dev auth session");
      if (isDevRuntime) {
        request.log.info("auth bootstrap: dev");
      }

      return {
        token: session.token,
        user,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Dev auth failed";
      reply.status(400);
      return buildRequestError(message, "AUTH_INVALID");
    }
  });

  app.get(WS_PATH, { websocket: true }, (socket, request) => {
    // Resolve send/close/on from first or second arg (in scope for catch). Prefer socket (WebSocket) so we never use request.send.
    const connection = resolveSocketConnection(socket) ?? resolveSocketConnection(request);
    if (!connection) {
      request.log.warn({ path: WS_PATH }, "ws handler: socket has no send/close/on");
      return;
    }
    try {
      // Auth: Sec-WebSocket-Protocol first, then query ?token= as fallback (for Telegram WebView / Cloudflare).
      const connectionId = "conn_" + Date.now() + "_" + Math.random().toString(36).slice(2, 8);
      const rawReq =
        request != null && typeof request === "object" && "raw" in request
          ? (request.raw as { headers?: Record<string, string | string[] | undefined>; url?: string } | undefined)
          : undefined;

      if (isDevRuntime) {
        request.log.info({ connectionId }, "ws handshake received");
      }

    let rawSubprotocolHeader = getHeader(request, "sec-websocket-protocol");
    // 1) Token from Sec-WebSocket-Protocol
    let authToken = extractAuthTokenFromSubprotocolHeader(rawSubprotocolHeader ?? undefined);
    let wsAuthSource: "protocol" | "query" | "none" = authToken ? "protocol" : "none";

    if (!authToken) {
      // 2) Token from Fastify request.query (most reliable for websocket route)
      const reqQuery =
        request != null && typeof request === "object" && "query" in request
          ? (request.query as Record<string, unknown> | undefined)
          : undefined;
      const queryToken =
        typeof reqQuery?.token === "string"
          ? reqQuery.token.trim()
          : typeof reqQuery?.auth === "string"
            ? reqQuery.auth.trim()
            : null;
      if (queryToken) {
        authToken = queryToken;
        wsAuthSource = "query";
      }
    }

    if (!authToken) {
      // 3) Fallback: manual URL parsing. URL was stored in upgrade listener keyed by TCP socket.
      // TCP socket: same ref as in upgrade event, accessible as request.raw.socket (IncomingMessage) or socket._socket (WebSocket).
      const tcpSocketFromRequest = rawReq && typeof (rawReq as { socket?: unknown }).socket !== "undefined" ? (rawReq as { socket: object }).socket : undefined;
      const tcpSocketFromWs = socket != null && typeof socket === "object" ? (socket as { _socket?: unknown })._socket : undefined;
      const urlFromTcpSocket =
        (tcpSocketFromRequest ? wsFullUrlByTcpSocket.get(tcpSocketFromRequest) : undefined) ??
        (tcpSocketFromWs != null ? wsFullUrlByTcpSocket.get(tcpSocketFromWs as object) : undefined);
      const raw = request.raw as { url?: string; __wsFullUrl?: string } | undefined;
      const urlFromRaw = raw ? (raw[WS_FULL_URL_KEY] ?? raw.url) : undefined;
      const urlToParse =
        (typeof urlFromTcpSocket === "string" && urlFromTcpSocket.length > 0 ? urlFromTcpSocket : null) ??
        (typeof urlFromRaw === "string" && urlFromRaw.length > 0 ? urlFromRaw : null) ??
        (request.raw ? wsFullUrlByRaw.get(request.raw as object) : null) ??
        wsFullUrlByRequest.get(request as object) ??
        request.url ??
        "";
      const queryParams = getQueryParamsFromUrl(urlToParse);
      const fromUrl = extractAuthTokenFromQuery(queryParams);
      if (fromUrl) {
        authToken = fromUrl;
        wsAuthSource = "query";
      }
    }

    // Diagnostic: token presence, source, length, preview (no full token in logs).
    const tokenPreview =
      authToken != null && authToken.length > 0
        ? authToken.slice(0, 6) + "…"
        : "(none)";
    const authSession = authSessions.verify(authToken);
    request.log.info(
      {
        connectionId,
        wsAuthSource,
        tokenLength: authToken != null ? authToken.length : 0,
        tokenPreview,
        authSessionFound: Boolean(authSession),
      },
      "ws auth verify"
    );

    if (isDevRuntime && authSession) {
      request.log.info({ connectionId }, "ws token validated");
    }

    const diag = getWsAuthDiagnostics(request, authToken, Boolean(authSession));
    if (authToken && authSession) {
      diag.source = wsAuthSource;
    }

    if (!authSession) {
      request.log.warn(
        {
          connectionId,
          path: WS_PATH,
          ...(isDevRuntime ? { wsAuthSource: diag.source, rejectReason: diag.rejectReason, authSourcesPresent: diag.sourcesChecked } : {}),
        },
        "websocket auth fail"
      );
      if (isDevRuntime) {
        request.log.warn(
          { connectionId, reason: diag.rejectReason ?? "auth rejected" },
          "bootstrap fails"
        );
      }
      const wsError =
        diag.rejectReason === "invalid_or_expired"
          ? buildRequestError(
              "Session expired or invalid. Open the app from Telegram again.",
              "AUTH_INVALID"
            )
          : buildRequestError(
              "Trusted auth token is required. Open the app from Telegram to connect.",
              "AUTH_REQUIRED"
            );
      safeCloseUnauthorized(connection, wsError);
      return;
    }

    let currentRoom: GameRoom | null = null;
    const authenticatedUser: TelegramUserIdentity = authSession.user;

    if (isDevRuntime) {
      request.log.info(
        { connectionId, telegramUserId: authenticatedUser.telegramUserId },
        "ws session/user resolved"
      );
    }

    request.log.info(
      {
        connectionId,
        path: WS_PATH,
        telegramUserId: authenticatedUser.telegramUserId,
        ...(isDevRuntime ? { wsAuthSource } : {}),
      },
      "websocket auth success"
    );

    // Dev: wrap send to log first server event and room/lobby bootstrap; do not log raw payloads or secrets.
    let initialEventLogged = false;
    let bootstrapEventLogged = false;
    const connectionSend = (payload: { type?: string } & Record<string, unknown>) => {
      if (isDevRuntime) {
        if (!initialEventLogged) {
          initialEventLogged = true;
          request.log.info({ connectionId }, "initial server event sent");
        }
        const eventType = payload?.type;
        if (eventType === "room.created" || eventType === "room.joined") {
          if (!bootstrapEventLogged) {
            bootstrapEventLogged = true;
            request.log.info({ connectionId, eventType }, "room/lobby bootstrap sent");
          }
        }
      }
      connection.send(JSON.stringify(payload));
    };

    if (isDevRuntime) {
      request.log.info({ connectionId }, "ws client registered");
    }

    connectionSend({
      type: "connection.ready",
      user: {
        telegramUserId: authenticatedUser.telegramUserId,
        displayName: authenticatedUser.displayName,
      },
    });
    request.log.info({ connectionId }, "connection.ready sent");

    preventWsSocketDestroy(request.raw);

    connection.on("message", (msg: { toString(): string }) => {
      try {
        const data = JSON.parse(msg.toString()) as ClientToServerMessage;

        switch (data.type) {
          case "room.create": {
            if (!limiters.createRoom.check(`create:${authenticatedUser.telegramUserId}`)) {
              safeReplyWithError(
                connection,
                buildRequestError("Too many room creation attempts. Try again in a minute.", "RATE_LIMITED")
              );
              request.log.warn({ connectionId, telegramUserId: authenticatedUser.telegramUserId }, "room create rate limited");
              break;
            }
            currentRoom = registry.createRoom();
            const createdMessage = currentRoom.createHost(authenticatedUser, {
              id: connectionId,
              send: connectionSend,
            });
            roomLifecycle.recordRoomCreated(currentRoom.toRuntimeState(), authenticatedUser);
            request.log.info(
              {
                connectionId,
                roomId: currentRoom.id,
                playerId: createdMessage.playerId,
                ...(isDevRuntime ? { telegramUserId: authenticatedUser.telegramUserId } : {}),
              },
              "room create"
            );
            break;
          }

          case "room.join": {
            if (!limiters.joinRoom.check(`join:${authenticatedUser.telegramUserId}`)) {
              safeReplyWithError(
                connection,
                buildRequestError("Too many join attempts. Try again in a minute.", "RATE_LIMITED")
              );
              request.log.warn({ connectionId, telegramUserId: authenticatedUser.telegramUserId }, "room join rate limited");
              break;
            }
            const room = registry.getRoom(data.roomId);
            if (!room) {
              throw new Error("Room not found");
            }
            // Identity from authenticated session only; room looked up by server-known id.
            currentRoom = room;
            const joinedMessage = room.join(authenticatedUser, {
              id: connectionId,
              send: connectionSend,
            });
            roomLifecycle.recordPlayerJoined(room.toRuntimeState(), authenticatedUser);
            request.log.info(
              {
                connectionId,
                roomId: room.id,
                playerId: joinedMessage.playerId,
                ...(isDevRuntime ? { telegramUserId: authenticatedUser.telegramUserId } : {}),
              },
              "room join"
            );
            break;
          }

          case "player.reconnect": {
            if (!limiters.reconnect.check(`reconnect:${authenticatedUser.telegramUserId}`)) {
              safeReplyWithError(
                connection,
                buildRequestError("Too many reconnect attempts. Try again in a minute.", "RATE_LIMITED")
              );
              request.log.warn({ connectionId, telegramUserId: authenticatedUser.telegramUserId }, "reconnect rate limited");
              break;
            }
            let room = registry.getRoom(data.roomId);
            if (!room) {
              const recoveredRuntime = reconnectService.recoverRoomRuntime(
                data.roomId,
                data.sessionToken,
                authenticatedUser.telegramUserId
              );
              if (!recoveredRuntime) {
                throw new Error("Room not found");
              }
              room = registry.restoreRoom(data.roomId, recoveredRuntime);
            }

            currentRoom = room;
            room.reconnect(authenticatedUser, data.sessionToken, {
              id: connectionId,
              send: connectionSend,
            });
            const reconnectedPlayerId = room.getPlayerIdByConnection(connectionId);
            if (reconnectedPlayerId) {
              roomLifecycle.recordPlayerReconnected(room.toRuntimeState(), reconnectedPlayerId);
            }
            break;
          }

          case "room.leave": {
            const room = registry.getRoom(data.roomId);
            if (!room) {
              throw new Error("Room not found");
            }

            const wasStarted = room.isStarted();
            const playerId = room.getPlayerIdByConnection(connectionId);
            room.leave(connectionId);
            if (playerId) {
              if (wasStarted) {
                roomLifecycle.recordPlayerDisconnected(room.toRuntimeState(), playerId);
              } else {
                roomLifecycle.recordPlayerLeftLobby(room.toRuntimeState(), playerId);
              }
            }
            if (room.isEmpty()) {
              registry.removeRoom(room.id);
              request.log.info({ roomId: room.id }, "room cleanup");
            }
            currentRoom = null;
            break;
          }

          case "room.start": {
            if (!limiters.startRoom.check(`start:${authenticatedUser.telegramUserId}`)) {
              safeReplyWithError(
                connection,
                buildRequestError("Too many start attempts. Try again in a minute.", "RATE_LIMITED")
              );
              request.log.warn({ connectionId, telegramUserId: authenticatedUser.telegramUserId }, "room start rate limited");
              break;
            }
            const room = registry.getRoom(data.roomId);
            if (!room) {
              throw new Error("Room not found");
            }

            currentRoom = room;
            room.start(connectionId, data.mode);
            roomLifecycle.recordMatchStarted(room.toRuntimeState());
            request.log.info(
              { connectionId, roomId: room.id, mode: data.mode, telegramUserId: authenticatedUser.telegramUserId },
              "room start"
            );
            if (isDevRuntime) {
              request.log.info(
                { roomId: room.id, mode: data.mode },
                "game start"
              );
            }
            break;
          }

          case "action": {
            if (!limiters.action.check(`action:${connectionId}`)) {
              safeReplyWithError(
                connection,
                buildRequestError("Too many actions. Slow down.", "RATE_LIMITED")
              );
              break;
            }
            if (!currentRoom) {
              throw new Error("Join a room before sending actions");
            }

            currentRoom.dispatch(connectionId, data.payload);
            roomLifecycle.recordStateAdvanced(currentRoom.toRuntimeState());
            break;
          }
        }
      } catch (error) {
        try {
          if (request != null && typeof request === "object") {
            const r = request as { log?: { warn?: (arg: unknown, msg: string) => void } };
            r.log?.warn?.({ connectionId, err: error }, "Rejected websocket message");
          }
          if (isDevRuntime) {
            const msg = error instanceof Error ? error.message : "unknown error";
            (request as { log?: { warn?: (arg: unknown, msg: string) => void } }).log?.warn?.(
              { connectionId, reason: msg },
              "bootstrap fails"
            );
          }
        } catch (_) {
          // ignore
        }
        safeReplyWithError(
          connection,
          buildRequestError(
            error instanceof Error ? error.message : "Invalid websocket message"
          )
        );
      }
    });

    const rawSocket = (connection as { _socket?: NodeJS.Socket })._socket;
    if (rawSocket && typeof rawSocket.on === "function") {
      rawSocket.on("error", (err: NodeJS.ErrnoException) => {
        request.log.warn(
          {
            connectionId,
            err: err?.message,
            code: err?.code,
          },
          "ws underlying socket error (e.g. ECONNRESET when tunnel closes connection)"
        );
      });
    }

    connection.on("error", (err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err);
      request.log.warn(
        { connectionId, err: msg, code: err instanceof Error && "code" in err ? (err as NodeJS.ErrnoException).code : undefined },
        "ws connection error (often ECONNRESET when tunnel/client closes TCP)"
      );
    });

    connection.on("close", (code?: number, reason?: Buffer | string) => {
      const reasonStr =
        reason == null ? undefined : typeof reason === "string" ? reason : reason.toString("utf8");
      request.log.info(
        {
          connectionId,
          roomId: currentRoom?.id ?? null,
          closeCode: code,
          closeReason: reasonStr ?? undefined,
        },
        "ws disconnect"
      );

      if (!currentRoom) {
        return;
      }

      const wasStarted = currentRoom.isStarted();
      const playerId = currentRoom.getPlayerIdByConnection(connectionId);
      currentRoom.leave(connectionId);
      if (playerId) {
        if (wasStarted) {
          roomLifecycle.recordPlayerDisconnected(currentRoom.toRuntimeState(), playerId);
        } else {
          roomLifecycle.recordPlayerLeftLobby(currentRoom.toRuntimeState(), playerId);
        }
      }
      if (currentRoom.isEmpty()) {
        registry.removeRoom(currentRoom.id);
      }
      currentRoom = null;
    });
    } catch (err) {
      try {
        if (request != null && typeof request === "object" && "log" in request) {
          const r = request as { log?: { error?: (arg: unknown) => void; warn?: (arg: unknown, msg: string) => void } };
          if (typeof r.log?.error === "function") {
            r.log.error({ err, msg: "WebSocket handler error" });
          }
          if (isDevRuntime && typeof r.log?.warn === "function") {
            const reason = err instanceof Error ? err.message : "handler error";
            r.log.warn({ reason }, "bootstrap fails");
          }
        }
      } catch (_) {
        // ignore
      }
      // Only close the socket; do not send (reply already sent for upgrade, connection.send might be reply.send if resolved wrong)
      try {
        if (connection && typeof (connection as { close?: (code?: number, reason?: string) => void }).close === "function") {
          (connection as { close: (code?: number, reason?: string) => void }).close(1011, "Server error");
        }
      } catch (_) {
        // ignore
      }
    }
  });

  // Periodic cleanup of empty rooms (no active members)
  const CLEANUP_INTERVAL_MS = 5 * 60 * 1000;
  const cleanupInterval = setInterval(() => {
    const ids = registry.getRoomIds();
    let removed = 0;
    for (const id of ids) {
      const room = registry.getRoom(id);
      if (room?.isEmpty()) {
        registry.removeRoom(id);
        removed += 1;
      }
    }
    if (removed > 0) {
      app.log.info({ removed }, "room cleanup");
    }
  }, CLEANUP_INTERVAL_MS);
  app.addHook("onClose", () => clearInterval(cleanupInterval));

  // Single-origin: serve frontend build and SPA fallback (after /auth, /ws, /health, etc.)
  const staticRoot = options.staticRoot ?? null;
  if (staticRoot && fs.existsSync(staticRoot) && fs.statSync(staticRoot).isDirectory()) {
    // Stub so any old SW registration gets a no-op script; no-cache so shell stays fresh.
    app.get("/sw.js", (_request, reply) => {
      return reply
        .header("Cache-Control", "no-store, no-cache, must-revalidate")
        .header("Content-Type", "application/javascript; charset=utf-8")
        .send("// No-op; service worker disabled for this app.\n");
    });
    await app.register(fastifyStatic, {
      root: path.resolve(staticRoot),
      index: ["index.html"],
      prefix: "/",
    });
    app.addHook("preHandler", (request, reply, done) => {
      const path = request.url?.split("?")[0] ?? "";
      if (request.method === "GET" && (path === "/" || path === "/index.html")) {
        reply.header("Cache-Control", "no-store, no-cache, must-revalidate");
      }
      done();
    });
    app.setNotFoundHandler((request, reply) => {
      if (request.method === "GET") {
        return reply
          .header("Cache-Control", "no-store, no-cache, must-revalidate")
          .type("text/html")
          .sendFile("index.html");
      }
      return reply.code(404).send();
    });
  }

  return app;
}
