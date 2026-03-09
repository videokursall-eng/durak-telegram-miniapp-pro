import { useEffect, useSyncExternalStore } from "react";
import {
  applyAction,
  type ClientToServerMessage,
  createWsClientProtocols,
  type ErrorMessage,
  type GameAction,
  type GameMode,
  type GameState,
  type PlayerReconnectedMessage,
  type RoomCreatedMessage,
  type RoomJoinedMessage,
  type RoomPlayersMessage,
  type RoomSnapshot,
  type RoomStartedMessage,
  type RoomStateMessage,
  type ServerToClientMessage,
} from "@durak/shared";
import { WsClient } from "./wsClient";
import { createDemoGameState } from "../game/core/createDemoGameState";
import { getTelegramInitData, getTg, isTelegramMiniApp } from "../lib/telegram";
import { isDevelopmentAppEnv, isLocalDevAuthEnabled } from "../lib/runtimeEnv";
import { getApiBaseUrl, getWebSocketUrl } from "./runtimeConfig";

export type ConnectionStatus = "idle" | "connecting" | "connected" | "disconnected";
export type RoomStatus = "lobby" | "waiting" | "starting" | "in_game" | "reconnecting";
export type PendingAction = "create_room" | "join_room" | "start_room" | "reconnect" | null;

/** When in Telegram: auth is run on app start; WS is allowed only after 'success'. */
export type TelegramBootstrapStatus = "idle" | "loading" | "success" | "error";

type AuthSession = {
  token: string;
  user: {
    telegramUserId: string;
    username: string | null;
    firstName: string | null;
    lastName: string | null;
    photoUrl: string | null;
    displayName: string;
  };
};

type PersistedSession = {
  roomId: string;
  sessionToken: string;
  selfPlayerId: string;
};

const ROOM_STORAGE_KEY = "durak.room-session";
const AUTH_STORAGE_KEY = "durak.auth-session";
const DEV_CLIENT_ID_STORAGE_KEY = "durak.dev-client-id";
const AUTH_REQUEST_TIMEOUT_MS = 10000;
const CONNECTING_TIMEOUT_MS = 15000;
const AUTH_TELEGRAM_PATH = "/auth/telegram";
const AUTH_DEV_PATH = "/auth/dev";

const WS_DIAG = true; // temporary client-side diagnostics

function diagLog(...args: unknown[]) {
  if (WS_DIAG) console.log("[ws-store]", ...args);
}

export type GameSessionSnapshot = {
  connectionStatus: ConnectionStatus;
  roomStatus: RoomStatus;
  roomId: string | null;
  room: RoomSnapshot | null;
  roomState: GameState | null;
  authToken: string | null;
  selfPlayerId: string | null;
  sessionToken: string | null;
  isHost: boolean;
  lastMessage: ServerToClientMessage | null;
  lastError: ErrorMessage | null;
  isReconnecting: boolean;
  isUsingDemoFallback: boolean;
  isAuthenticating: boolean;
  pendingAction: PendingAction;
  /** Set when app is opened in Telegram; WS and room flow allowed only after 'success'. */
  telegramBootstrapStatus: TelegramBootstrapStatus;
  /** Last WebSocket close diagnostics to surface in UI when DevTools are unavailable. */
  lastCloseCode: number | null;
  lastCloseReason: string | null;
};

type Listener = () => void;

function loadJson<T>(key: string): T | null {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch (error) {
    console.warn(`Failed to load ${key}`, error);
    return null;
  }
}

function saveJson(key: string, value: unknown) {
  window.localStorage.setItem(key, JSON.stringify(value));
}

function clearJson(key: string) {
  window.localStorage.removeItem(key);
}

function loadSessionJson<T>(key: string): T | null {
  try {
    const raw = window.sessionStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch (error) {
    console.warn(`Failed to load ${key} from session storage`, error);
    return null;
  }
}

function saveSessionJson(key: string, value: unknown) {
  window.sessionStorage.setItem(key, JSON.stringify(value));
}

function clearSessionJson(key: string) {
  window.sessionStorage.removeItem(key);
}

function getDevClientId() {
  const existing = window.sessionStorage.getItem(DEV_CLIENT_ID_STORAGE_KEY);
  if (existing) {
    return existing;
  }

  const created = crypto.randomUUID();
  window.sessionStorage.setItem(DEV_CLIENT_ID_STORAGE_KEY, created);
  return created;
}

function isIsolatedDevMode() {
  if (!isDevelopmentAppEnv()) {
    return false;
  }

  const query = new URLSearchParams(window.location.search);
  const queryFlag = query.get("isolated");
  if (queryFlag === "1" || queryFlag === "true") {
    return true;
  }

  return import.meta.env.VITE_ISOLATED_DEV_MODE === "1";
}

function getApiUrl(path: string) {
  return `${getApiBaseUrl()}${path}`;
}

/** Backend accepts auth only via Sec-WebSocket-Protocol; use shared contract so server can extract token. */
function getWsProtocols(authToken: string) {
  return createWsClientProtocols(authToken);
}

class GameSessionStore {
  private client: WsClient | null = null;
  private listeners = new Set<Listener>();
  private pendingMessages: ClientToServerMessage[] = [];
  private initializedReconnect = false;
  private authPromise: Promise<string> | null = null;
  private connectingTimeoutId: ReturnType<typeof window.setTimeout> | null = null;

  private snapshot: GameSessionSnapshot = (() => {
    const persistedRoom = typeof window !== "undefined" ? loadJson<PersistedSession>(ROOM_STORAGE_KEY) : null;
    const persistedAuth =
      typeof window !== "undefined" ? loadSessionJson<AuthSession>(AUTH_STORAGE_KEY) : null;

    // В проде авто-reconnect между сессиями больше не используем — он даёт нестабильный UX,
    // когда старые данные комнаты мешают новому запуску. Если что-то осталось в сторадже,
    // просто очищаем и стартуем с чистого лобби.
    if (persistedRoom && typeof window !== "undefined") {
      try {
        clearJson(ROOM_STORAGE_KEY);
      } catch {
        // ignore
      }
    }

    return {
      connectionStatus: "idle",
      roomStatus: "lobby",
      roomId: null,
      room: null,
      roomState: null,
      authToken: persistedAuth?.token ?? null,
      selfPlayerId: null,
      sessionToken: null,
      isHost: false,
      lastMessage: null,
      lastError: null,
      isReconnecting: false,
      isUsingDemoFallback: false,
      isAuthenticating: false,
      pendingAction: null,
      telegramBootstrapStatus: "idle",
      lastCloseCode: null,
      lastCloseReason: null,
    };
  })();

  subscribe = (listener: Listener) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  getSnapshot = () => this.snapshot;

  connect = (optionalToken?: string) => {
    const token = optionalToken ?? this.snapshot.authToken ?? null;
    diagLog("connect called", "optionalToken:", !!optionalToken, "hasToken:", !!token, "connectionStatus:", this.snapshot.connectionStatus);
    // Never open WebSocket without a valid token (except demo fallback).
    if (!token && !this.snapshot.isUsingDemoFallback) {
      if (isLocalDevAuthEnabled()) {
        diagLog("connect skipped: no token, local dev");
        return;
      }
      this.maybeEnableDemoFallback();
      return;
    }
    if (this.snapshot.isUsingDemoFallback) {
      diagLog("connect skipped: demo fallback");
      return;
    }

    // Do not replace an already connecting or connected client (avoids race: second connect() closing the first socket).
    if (this.snapshot.connectionStatus === "connecting" || this.snapshot.connectionStatus === "connected") {
      diagLog("connect called but already connecting/connected, skip");
      return;
    }

    // If there is already a socket (e.g. disconnected but client ref left), close it and reconnect with auth.
    if (this.client) {
      diagLog("connect called, client replaced (was disconnected/idle), disconnecting old client");
      if (import.meta.env.DEV) {
        console.info("[dev] reconnect after auth");
      }
      this.client.disconnect();
      this.client = null;
    }

    diagLog("connect: opening new socket");
    this.clearConnectingTimeout();
    this.setSnapshot({
      connectionStatus: "connecting",
    });
    // Clearing "connecting" happens only in handleStatusChange(true) when socket.onopen fires.
    // We do not wait for the first server message (connection.ready); the backend sends it immediately after auth.

    // We only reach here when not in demo and we have a token; always send auth via protocol.
    const protocols = getWsProtocols(token!);
    if (import.meta.env.DEV) {
      console.info("websocket connect attempt after auth");
      console.info("[dev] websocket auth transport used: protocol");
    }

    const client = new WsClient(this.handleMessage, this.handleStatusChange, this.handleTransportError);
    this.client = client;

    this.connectingTimeoutId = window.setTimeout(() => {
      this.connectingTimeoutId = null;
      if (this.snapshot.connectionStatus !== "connecting" || this.client !== client) {
        return;
      }
      diagLog("connecting timeout: client nulled");
      this.client = null;
      this.setSnapshot({
        connectionStatus: "disconnected",
        lastError: {
          type: "error",
          code: "NETWORK_ERROR",
          message: "Connection timed out. Check your network and that the server is reachable.",
        },
        lastMessage: {
          type: "error",
          code: "NETWORK_ERROR",
          message: "Connection timed out. Check your network and that the server is reachable.",
        },
      });
      if (import.meta.env.DEV) {
        console.warn("[dev] websocket connecting timeout");
      }
    }, CONNECTING_TIMEOUT_MS);

    client.connect(
      getWebSocketUrl(token),
      protocols
    );
  };

  disconnect = () => {
    diagLog("disconnect called", "hasClient:", !!this.client, "connectionStatus:", this.snapshot.connectionStatus);
    if (!this.client) {
      return;
    }

    this.clearConnectingTimeout();
    this.client.disconnect();
    this.client = null;
    this.setSnapshot({
      connectionStatus: "disconnected",
    });
    this.maybeEnableDemoFallback();
  };

  /**
   * Run Telegram Mini App bootstrap: init WebApp, then POST /auth/telegram with initData.
   * Call once on app start when in Telegram. После успешной авторизации WS открывается
   * только по действию пользователя (create/join/reconnect), чтобы не держать висящий
   * сокет в лобби и не ловить обрыв 1006 от туннеля.
   */
  startTelegramBootstrap = (): Promise<void> => {
    if (!isTelegramMiniApp()) {
      this.setSnapshot({ telegramBootstrapStatus: "success" });
      return Promise.resolve();
    }
    if (!getTelegramInitData()) {
      this.setSnapshot({ telegramBootstrapStatus: "success" });
      return Promise.resolve();
    }

    if (this.snapshot.telegramBootstrapStatus === "loading") {
      return this.authPromise?.then(() => {}) ?? Promise.resolve();
    }
    if (this.snapshot.telegramBootstrapStatus === "success" && this.snapshot.authToken) {
      return Promise.resolve();
    }
    if (this.snapshot.connectionStatus === "connected") {
      this.setSnapshot({ telegramBootstrapStatus: "success" });
      return Promise.resolve();
    }

    const tg = getTg();
    if (tg) {
      tg.ready();
      tg.expand?.();
    }

    if (this.client) {
      this.client.disconnect();
      this.client = null;
      this.clearConnectingTimeout();
      this.setSnapshot({ connectionStatus: "disconnected" });
    }

    this.setSnapshot({ telegramBootstrapStatus: "loading", lastError: null });
    this.authPromise = this.ensureAuthenticated(undefined, true);
    return this.authPromise
      .then((token) => {
        // Успешный bootstrap: сохраняем токен и сразу открываем WS один раз.
        this.setSnapshot({ telegramBootstrapStatus: "success", authToken: token, lastError: null });
        if (this.snapshot.connectionStatus !== "connecting" && this.snapshot.connectionStatus !== "connected") {
          this.connect(token);
        }
      })
      .catch(() => {
        this.setSnapshot({ telegramBootstrapStatus: "error" });
      });
  };

  createRoom = async (playerName: string) => {
    this.clearRoomData(false);
    this.setSnapshot({
      pendingAction: "create_room",
      lastError: null,
    });
    if (import.meta.env.DEV) {
      console.info("room create request started");
    }
    // Telegram: ensureAuthenticated already run at bootstrap; reuse existing token.
    // Dev: ensureAuthenticated will issue dev token on first call, then reuse it.
    const token = await this.ensureAuthenticated(playerName);
    this.connect(token);
    this.sendMessage({ type: "room.create" });
  };

  joinRoom = async (roomId: string, playerName: string) => {
    this.clearRoomData(false);
    this.setSnapshot({
      pendingAction: "join_room",
      lastError: null,
    });
    if (import.meta.env.DEV) {
      console.info("[dev] join room request start", { roomId: roomId.trim().toUpperCase() });
    }
    // Auth: reuse existing Telegram/dev token when available; avoid extra /auth calls.
    const token = await this.ensureAuthenticated(playerName);
    this.connect(token);
    this.sendMessage({
      type: "room.join",
      roomId: roomId.trim().toUpperCase(),
    });
  };

  leaveRoom = () => {
    if (this.snapshot.roomId && !this.snapshot.isUsingDemoFallback) {
      this.sendMessage({
        type: "room.leave",
        roomId: this.snapshot.roomId,
      });
    }

    this.clearRoomData(true);
  };

  startRoom = (mode: GameMode) => {
    if (!this.snapshot.roomId) {
      return;
    }

    this.setSnapshot({
      pendingAction: "start_room",
      lastError: null,
    });
    console.info("Starting room via backend", {
      roomId: this.snapshot.roomId,
      mode,
    });
    this.sendMessage({
      type: "room.start",
      roomId: this.snapshot.roomId,
      mode,
    });
  };

  attemptReconnect = async () => {
    if (!this.snapshot.roomId || !this.snapshot.sessionToken) {
      return;
    }

    this.setSnapshot({
      roomStatus: "reconnecting",
      isReconnecting: true,
      lastError: null,
      pendingAction: "reconnect",
    });
    console.info("Attempting room reconnect", {
      roomId: this.snapshot.roomId,
    });

    const token = await this.ensureAuthenticated();
    this.connect(token);
    this.sendMessage({
      type: "player.reconnect",
      roomId: this.snapshot.roomId,
      sessionToken: this.snapshot.sessionToken,
    });
  };

  enterGame = () => {
    if (!this.snapshot.roomState) {
      return;
    }

    this.setSnapshot({
      roomStatus: "in_game",
    });
  };

  resetToLobby = () => {
    this.clearRoomData(true);
  };

  sendAction = (action: GameAction) => {
    if (this.snapshot.isUsingDemoFallback && this.snapshot.roomState) {
      try {
        const nextState = applyAction(this.snapshot.roomState, action);
        this.setSnapshot({
          roomState: nextState,
          roomId: this.snapshot.roomId ?? "demo-room",
        });
      } catch (error) {
        console.warn("Demo action rejected", error);
      }
      return;
    }

    this.sendMessage({
      type: "action",
      payload: action,
    });
  };

  private handleMessage = (message: ServerToClientMessage) => {
    switch (message.type) {
      case "connection.ready":
        // Server confirmed auth; we are connected. Always set so lobby shows (covers onopen/ordering).
        diagLog("connection.ready received", "connectionStatus before:", this.snapshot.connectionStatus);
        this.setSnapshot({ connectionStatus: "connected" });
        if (import.meta.env.DEV) {
          console.info(
            "connection.ready received",
            message.user
              ? { telegramUserId: message.user.telegramUserId, displayName: message.user.displayName }
              : undefined
          );
        } else {
          console.info("connection.ready received");
        }
        return;

      case "room.created":
        this.applyJoinedRoom(message);
        return;

      case "room.joined":
        this.applyJoinedRoom(message);
        return;

      case "room.players":
        this.applyRoomPlayers(message);
        return;

      case "room.started":
        this.applyRoomStarted(message);
        return;

      case "player.reconnected":
        this.applyReconnectedPlayer(message);
        return;

      case "room.state":
        this.applyRoomState(message);
        return;

      case "error":
        // Only clear auth when we're actually connected (error refers to current session). Avoids clearing on stale messages.
        if (
          (message.code === "AUTH_REQUIRED" || message.code === "AUTH_INVALID") &&
          this.snapshot.connectionStatus === "connected"
        ) {
          this.clearAuthState();
        }
        const wasCreateRoom = this.snapshot.pendingAction === "create_room";
        this.setSnapshot({
          lastMessage: message,
          lastError: message,
          pendingAction: null,
          isAuthenticating: false,
        });
        if (message.code === "RATE_LIMITED") {
          console.warn("Request rate limited:", message.message);
        } else if (import.meta.env.DEV) {
          if (wasCreateRoom) {
            console.warn("room create request failed:", message.message);
          } else {
            console.warn("[dev] request failed:", message.message);
          }
        } else {
          console.warn("Request failed:", message.message);
        }
        return;

      case "room.left":
        if (message.playerId === this.snapshot.selfPlayerId) {
          this.clearRoomData(true);
          return;
        }

        this.setSnapshot({
          lastMessage: message,
        });
        return;
    }
  };

  private handleTransportError = (message: string) => {
    // Abnormal close (1006) happens often because туннель/прокси/Telegram рвёт соединение.
    // Не показываем это как красную ошибку пользователю; просто логируем и даём UI продолжать работать.
    if (message === "WebSocket connection closed") {
      diagLog("transport error (closed) suppressed for UI", this.snapshot.lastCloseCode, this.snapshot.lastCloseReason);
      return;
    }
    const displayMessage =
      message === "WebSocket connection error"
        ? "Ошибка WebSocket. Убедитесь, что туннель проксирует путь /ws на backend (порт 8080) и сервер запущен."
        : message;
    const error: ErrorMessage = {
      type: "error",
      code: "NETWORK_ERROR",
      message: displayMessage,
    };

    const wasCreateRoom = this.snapshot.pendingAction === "create_room";
    this.setSnapshot({
      lastMessage: error,
      lastError: error,
      isAuthenticating: false,
      pendingAction: this.snapshot.roomStatus === "reconnecting" ? "reconnect" : null,
    });
    if (import.meta.env.DEV) {
      if (wasCreateRoom) {
        console.warn("room create request failed:", displayMessage);
      } else {
        console.warn("[dev] request failed:", displayMessage);
      }
    } else {
      console.warn("Connection error:", displayMessage);
    }
  };

  private clearConnectingTimeout() {
    if (this.connectingTimeoutId != null) {
      window.clearTimeout(this.connectingTimeoutId);
      this.connectingTimeoutId = null;
    }
  }

  private handleStatusChange = (connected: boolean, source?: WsClient, closeCode?: number, closeReason?: string) => {
    diagLog(
      "handleStatusChange",
      connected ? "true" : "false",
      "closeCode:",
      closeCode,
      "closeReason:",
      closeReason,
      "source===client:",
      source === this.client,
      "connectionStatus before:",
      this.snapshot.connectionStatus
    );
    this.clearConnectingTimeout();

    if (!connected) {
      if (source !== undefined && source !== this.client) {
        diagLog("handleStatusChange(false) ignored: source !== this.client (stale close)");
        return;
      }
      this.client = null;
      this.setSnapshot({
        lastCloseCode: closeCode ?? null,
        lastCloseReason: closeReason ?? null,
      });
    }

    const wasConnecting = this.snapshot.connectionStatus === "connecting";

    // Успешное открытие сокета: выходим из "connecting" и сбрасываем предыдущие ошибки.
    this.setSnapshot({
      connectionStatus: connected ? "connected" : "disconnected",
      ...(connected ? { lastError: null, lastMessage: null, pendingAction: null } : {}),
    });
    diagLog("connectionStatus set to", connected ? "connected" : "disconnected");

    if (connected) {
      this.flushPendingMessages();

      // If we had a persisted room and just opened the socket from bootstrap, send player.reconnect
      // once. Do NOT call attemptReconnect() here: it runs ensureAuthenticated() again (second POST)
      // and can trigger a second auth/ws cycle. We are already connected; only send the message.
      if (
        !this.initializedReconnect &&
        this.snapshot.roomStatus === "reconnecting" &&
        this.snapshot.roomId &&
        this.snapshot.sessionToken
      ) {
        this.initializedReconnect = true;
        this.sendMessage({
          type: "player.reconnect",
          roomId: this.snapshot.roomId,
          sessionToken: this.snapshot.sessionToken,
        });
      }
    }

    if (!connected) {
      const hasActiveRoom = Boolean(this.snapshot.roomId && this.snapshot.sessionToken);
      const authRejected =
        closeCode === 4401 || closeReason === "AUTH_REQUIRED" || closeReason === "AUTH_INVALID";

      // Если комнаты ещё нет и это не явный отказ в авторизации — считаем обрыв нефатальным.
      // Не блокируем лобби сообщением "Не удалось подключиться к серверу" при коде 1006 и т.п.
      if (!hasActiveRoom && !authRejected) {
        diagLog("connection closed without active room; suppressing network error", closeCode, closeReason);
        this.setSnapshot({
          lastMessage: null,
          lastError: null,
          pendingAction: null,
          isAuthenticating: false,
        });
        this.maybeEnableDemoFallback();
        return;
      }

      if (!this.snapshot.isUsingDemoFallback && hasActiveRoom) {
        this.setSnapshot({
          roomStatus: "reconnecting",
          isReconnecting: true,
        });
      } else {
        const errorMessage: ErrorMessage = authRejected
          ? {
              type: "error",
              code: "AUTH_INVALID",
              message: "Подключение отклонено. Откройте приложение из Telegram заново.",
            }
          : {
              type: "error",
              code: "NETWORK_ERROR",
              message:
                wasConnecting &&
                (this.snapshot.telegramBootstrapStatus === "success" || this.snapshot.telegramBootstrapStatus === "idle")
                  ? "Не удалось подключиться к серверу. Проверьте интернет или откройте приложение из Telegram снова."
                  : "Не удалось подключиться к локальному backend. Проверьте http://127.0.0.1:8080.",
            };
        this.setSnapshot({
          lastMessage: errorMessage,
          lastError: errorMessage,
          pendingAction: null,
          isAuthenticating: false,
          ...(authRejected ? { telegramBootstrapStatus: "error" as const } : {}),
        });
        if (import.meta.env.DEV) {
          console.warn("[dev] connection closed", { closeCode, closeReason, authRejected });
        }
      }
      this.maybeEnableDemoFallback();
    }
  };

  private maybeEnableDemoFallback() {
    if (!isIsolatedDevMode()) {
      return;
    }

    if (this.snapshot.connectionStatus === "connected") {
      return;
    }

    if (this.snapshot.authToken) {
      return;
    }

    if (this.snapshot.lastMessage) {
      return;
    }

    this.setSnapshot({
      roomId: "demo-room",
      room: null,
      roomState: createDemoGameState().raw,
      authToken: null,
      selfPlayerId: "p1",
      sessionToken: null,
      isHost: true,
      roomStatus: "in_game",
      isReconnecting: false,
      isUsingDemoFallback: true,
    });
  }

  private applyRoomState(message: RoomStateMessage) {
    this.setSnapshot({
      lastMessage: message,
      lastError: null,
      roomId: message.roomId,
      roomState: message.state,
      roomStatus: this.snapshot.roomStatus === "starting" ? "starting" : "in_game",
      isReconnecting: false,
      isUsingDemoFallback: false,
      pendingAction: null,
    });
  }

  private applyJoinedRoom(message: RoomCreatedMessage | RoomJoinedMessage) {
    saveJson(ROOM_STORAGE_KEY, {
      roomId: message.room.roomId,
      sessionToken: message.sessionToken,
      selfPlayerId: message.playerId,
    } satisfies PersistedSession);

    this.setSnapshot({
      lastMessage: message,
      lastError: null,
      roomStatus: "waiting",
      roomId: message.room.roomId,
      room: message.room,
      roomState: null,
      selfPlayerId: message.playerId,
      sessionToken: message.sessionToken,
      isHost: message.isHost,
      isReconnecting: false,
      isUsingDemoFallback: false,
      pendingAction: null,
    });
  }

  private applyRoomPlayers(message: RoomPlayersMessage) {
    this.setSnapshot({
      lastMessage: message,
      lastError: null,
      room: message.room,
      roomId: message.room.roomId,
      isHost: message.room.hostPlayerId === this.snapshot.selfPlayerId,
      roomStatus: message.room.status === "in_game" ? "in_game" : "waiting",
      isReconnecting: false,
      pendingAction: null,
    });
  }

  private applyRoomStarted(message: RoomStartedMessage) {
    this.setSnapshot({
      lastMessage: message,
      lastError: null,
      room: message.room,
      roomId: message.room.roomId,
      roomState: message.state,
      roomStatus: "starting",
      isReconnecting: false,
      pendingAction: null,
    });
  }

  private applyReconnectedPlayer(message: PlayerReconnectedMessage) {
    saveJson(ROOM_STORAGE_KEY, {
      roomId: message.room.roomId,
      sessionToken: message.sessionToken,
      selfPlayerId: message.playerId,
    } satisfies PersistedSession);

    this.setSnapshot({
      lastMessage: message,
      lastError: null,
      roomId: message.room.roomId,
      room: message.room,
      roomState: message.state,
      selfPlayerId: message.playerId,
      sessionToken: message.sessionToken,
      isHost: message.isHost,
      roomStatus: message.state ? "in_game" : "waiting",
      isReconnecting: false,
      isUsingDemoFallback: false,
      pendingAction: null,
    });
  }

  private sendMessage(message: ClientToServerMessage) {
    if (this.client && this.snapshot.connectionStatus === "connected") {
      if (import.meta.env.DEV && (message.type === "room.create" || message.type === "room.join")) {
        console.info("[dev]", message.type, "sent");
      }
      this.client.send(message);
      return;
    }

    this.pendingMessages.push(message);
    if (import.meta.env.DEV && (message.type === "room.create" || message.type === "room.join")) {
      console.info("[dev]", message.type, "queued (waiting for WS)");
    }
    // Only connect when we have a valid token; never open WS without auth.
    if (this.snapshot.connectionStatus !== "connecting") {
      const tokenForConnect = this.snapshot.authToken ?? undefined;
      if (tokenForConnect) {
        this.connect(tokenForConnect);
      }
    }
  }

  private flushPendingMessages() {
    if (!this.client || this.snapshot.connectionStatus !== "connected") {
      return;
    }

    const messages = [...this.pendingMessages];
    this.pendingMessages = [];
    for (const message of messages) {
      this.client.send(message);
    }
  }

  private clearRoomData(clearPersisted: boolean) {
    if (clearPersisted) {
      clearJson(ROOM_STORAGE_KEY);
    }

    this.pendingMessages = [];
    this.initializedReconnect = false;

    this.setSnapshot({
      roomStatus: "lobby",
      roomId: null,
      room: null,
      roomState: null,
      selfPlayerId: null,
      sessionToken: null,
      isHost: false,
      lastMessage: null,
      lastError: null,
      isReconnecting: false,
      isUsingDemoFallback: false,
      isAuthenticating: false,
      pendingAction: null,
    });
  }

  private clearAuthState() {
    diagLog("clearAuthState called");
    clearSessionJson(AUTH_STORAGE_KEY);
    this.authPromise = null;
    this.client?.disconnect();
    this.client = null;
    this.setSnapshot({
      authToken: null,
      connectionStatus: "disconnected",
      isAuthenticating: false,
      pendingAction: null,
      telegramBootstrapStatus: "idle",
    });
  }

  private async ensureAuthenticated(playerName?: string, forceRefresh = false) {
    const initData = getTelegramInitData();
    diagLog("ensureAuthenticated called", "hasToken:", !!this.snapshot.authToken, "forceRefresh:", forceRefresh);

    if (this.snapshot.authToken && !forceRefresh) {
      diagLog("ensureAuthenticated: using existing token");
      return this.snapshot.authToken;
    }

    if (this.authPromise) {
      diagLog("ensureAuthenticated: reusing authPromise");
      return this.authPromise;
    }

    this.setSnapshot({
      isAuthenticating: true,
      lastError: null,
    });

    const request =
      initData != null
        ? {
            url: getApiUrl(AUTH_TELEGRAM_PATH),
            body: { initData },
          }
        : isLocalDevAuthEnabled()
          ? {
              url: getApiUrl(AUTH_DEV_PATH),
              body: {
                playerName: playerName?.trim() || "Local Player",
                clientId: getDevClientId(),
              },
            }
          : null;

    if (!request) {
      const message = isLocalDevAuthEnabled()
        ? "Telegram initData is unavailable and local development auth is disabled"
        : "Open the app from Telegram (menu or bot link) to play";
      const error: ErrorMessage = {
        type: "error",
        code: "AUTH_INVALID",
        message,
      };
      this.setSnapshot({
        lastMessage: error,
        lastError: error,
        isAuthenticating: false,
        pendingAction: null,
      });
      if (import.meta.env.DEV) {
        console.warn("[dev] request failed:", error.message);
      }
      throw new Error(error.message);
    }

    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), AUTH_REQUEST_TIMEOUT_MS);

    const authSource = request.url.includes(AUTH_DEV_PATH) ? "dev" : "telegram";
    if (import.meta.env.DEV) {
      if (authSource === "telegram") {
        const tg = getTg();
        console.info(tg ? "Telegram SDK detected" : "Telegram SDK not detected");
        console.info(initData != null ? "initData received" : "initData missing");
        console.info("Telegram auth request started");
      } else {
        console.info("[dev] auth bootstrap started", { authSource });
      }
    }

    this.authPromise = fetch(request.url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify(request.body),
      signal: controller.signal,
    })
      .then(async (response) => {
        const payload = (await response.json()) as
          | AuthSession
          | ErrorMessage;

        if (!response.ok || "type" in payload) {
          const error: ErrorMessage = "type" in payload
            ? payload
            : {
                type: "error",
                code: "AUTH_INVALID",
                message: "Telegram auth failed",
              };
          this.setSnapshot({
            lastMessage: error,
            lastError: error,
            pendingAction: null,
          });
          if (import.meta.env.DEV) {
            if (authSource === "telegram") {
              console.warn("Telegram auth fail:", error.message);
            } else {
              console.warn("[dev] request failed:", error.message);
            }
          }
          throw new Error(error.message);
        }

        saveSessionJson(AUTH_STORAGE_KEY, payload);
        this.setSnapshot({
          authToken: payload.token,
          lastError: null,
        });
        // Snapshot now has the new token; any connect(token) or connect(snapshot.authToken) will use it.
        if (import.meta.env.DEV) {
          if (authSource === "telegram") {
            console.info("Telegram auth success");
          } else {
            console.info("[dev] auth bootstrap success", { authSource });
          }
        }
        return payload.token;
      })
      .catch((error) => {
        let message: string;
        if (error instanceof DOMException && error.name === "AbortError") {
          message = "Истек таймаут авторизации. Проверьте локальный backend на 127.0.0.1:8080.";
        } else if (error instanceof TypeError && error.message === "Failed to fetch") {
          message =
            "Не удалось связаться с сервером. Запустите backend: pnpm --filter ./apps/server dev (порт 8080). Откройте приложение по http://localhost:5173.";
        } else {
          message = error instanceof Error ? error.message : "Authentication request failed";
        }
        const requestError: ErrorMessage = {
          type: "error",
          code: "AUTH_INVALID",
          message,
        };
        this.setSnapshot({
          lastMessage: requestError,
          lastError: requestError,
          pendingAction: null,
        });
        if (import.meta.env.DEV) {
          console.warn("[dev] request failed:", message);
        }
        throw requestError;
      })
      .finally(() => {
        window.clearTimeout(timeoutId);
        this.authPromise = null;
        this.setSnapshot({
          isAuthenticating: false,
        });
      });

    return this.authPromise;
  }

  private setSnapshot(patch: Partial<GameSessionSnapshot>) {
    this.snapshot = {
      ...this.snapshot,
      ...patch,
    };

    for (const listener of this.listeners) {
      listener();
    }
  }
}

export const gameSessionStore = new GameSessionStore();

export function useGameSession(autoConnect = true) {
  const snapshot = useSyncExternalStore(
    gameSessionStore.subscribe,
    gameSessionStore.getSnapshot,
    gameSessionStore.getSnapshot
  );

  useEffect(() => {
    if (!autoConnect) return;
    if (isTelegramMiniApp()) return;
    if (isLocalDevAuthEnabled()) return;
    if (snapshot.authToken && snapshot.connectionStatus === "idle") {
      gameSessionStore.connect(snapshot.authToken);
    }
    return () => gameSessionStore.disconnect();
  }, [autoConnect, snapshot.authToken, snapshot.connectionStatus]);

  return {
    ...snapshot,
    connect: gameSessionStore.connect,
    disconnect: gameSessionStore.disconnect,
    startTelegramBootstrap: gameSessionStore.startTelegramBootstrap,
    createRoom: gameSessionStore.createRoom,
    joinRoom: gameSessionStore.joinRoom,
    leaveRoom: gameSessionStore.leaveRoom,
    startRoom: gameSessionStore.startRoom,
    attemptReconnect: gameSessionStore.attemptReconnect,
    enterGame: gameSessionStore.enterGame,
    resetToLobby: gameSessionStore.resetToLobby,
    sendAction: gameSessionStore.sendAction,
  };
}
