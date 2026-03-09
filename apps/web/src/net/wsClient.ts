/**
 * WebSocket client — THE KEY FILE.
 *
 * Lifecycle:
 *  1. connect(token) — open WS, on open send auth handshake.
 *  2. Server validates token and responds with `connection.ready`.
 *  3. onReady callback fires → store transitions idle→lobby (or game sync).
 *  4. On close: call store.reconnect() (phase → 'connecting', token kept),
 *     then schedule exponential-backoff reconnect with the SAME token.
 *     We NEVER re-call POST /auth/telegram here.
 *  5. On reconnect after in-game: after connection.ready, send sync.state.
 *
 * ⚠️  Do NOT call store.setPhase('idle') or store.reset() on disconnect.
 *      That causes the auth loop bug. Only call store.reconnect().
 */

import type {
  ClientMsg,
  ServerMsg,
  MsgConnectionReady,
  MsgRoomJoined,
  MsgRoomPlayers,
  MsgMatchStarted,
  MsgStateSnapshot,
  MsgAck,
  MsgError,
  MsgMatchEnded,
} from '@durak/shared';
import { useStore } from '../state/store';

// ─── Types ─────────────────────────────────────────────────────────────────────

export type WsEventMap = {
  ready: MsgConnectionReady;
  'room.joined': MsgRoomJoined;
  'room.players': MsgRoomPlayers;
  'match.started': MsgMatchStarted;
  'state.snapshot': MsgStateSnapshot;
  ack: MsgAck;
  error: MsgError;
  'match.ended': MsgMatchEnded;
};

type WsEventHandler<K extends keyof WsEventMap> = (msg: WsEventMap[K]) => void;

interface WsClientOptions {
  url: string;
  /** Called each time the WS connection is fully authenticated and ready. */
  onReady?: (msg: MsgConnectionReady) => void;
  onMessage?: (msg: ServerMsg) => void;
  onDisconnect?: () => void;
}

// ─── Constants ─────────────────────────────────────────────────────────────────

const RECONNECT_DELAY_INITIAL_MS = 1_000;
const RECONNECT_DELAY_MAX_MS = 30_000;
const RECONNECT_JITTER_MS = 500;
const PING_INTERVAL_MS = 25_000;

// ─── WsClient ──────────────────────────────────────────────────────────────────

export class WsClient {
  private ws: WebSocket | null = null;
  private token: string | null = null;
  private reconnectDelay = RECONNECT_DELAY_INITIAL_MS;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private destroyed = false;
  private isAuthenticated = false;
  private readonly options: WsClientOptions;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private handlers = new Map<string, Set<WsEventHandler<any>>>();

  constructor(options: WsClientOptions) {
    this.options = options;
  }

  // ── Public API ──────────────────────────────────────────────────────────────

  /**
   * Open the WebSocket connection with the given auth token.
   * Safe to call multiple times — closes any existing connection first.
   */
  connect(token: string): void {
    if (this.destroyed) return;
    this.token = token;
    this.isAuthenticated = false;
    this.openSocket();
  }

  disconnect(): void {
    this.destroyed = true;
    this.clearTimers();
    if (this.ws) {
      this.ws.onclose = null; // prevent reconnect loop on intentional close
      this.ws.close(1000, 'client disconnect');
      this.ws = null;
    }
  }

  send(msg: ClientMsg): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN || !this.isAuthenticated) {
      console.warn('[WS] Cannot send — not ready', msg.type);
      return;
    }
    this.ws.send(JSON.stringify(msg));
  }

  on<K extends keyof WsEventMap>(event: K, handler: WsEventHandler<K>): void {
    if (!this.handlers.has(event)) {
      this.handlers.set(event, new Set());
    }
    this.handlers.get(event)!.add(handler as WsEventHandler<typeof event>);
  }

  off<K extends keyof WsEventMap>(event: K, handler: WsEventHandler<K>): void {
    this.handlers.get(event)?.delete(handler as WsEventHandler<typeof event>);
  }

  get connected(): boolean {
    return this.isAuthenticated;
  }

  // ── Private ─────────────────────────────────────────────────────────────────

  private openSocket(): void {
    if (this.ws) {
      this.ws.onclose = null;
      this.ws.onerror = null;
      this.ws.onmessage = null;
      this.ws.onopen = null;
      if (
        this.ws.readyState === WebSocket.OPEN ||
        this.ws.readyState === WebSocket.CONNECTING
      ) {
        this.ws.close(1000, 'reconnecting');
      }
      this.ws = null;
    }
    this.isAuthenticated = false;
    this.clearTimers();

    const wsUrl = this.buildUrl();
    console.log('[WS] Connecting to', wsUrl);

    let socket: WebSocket;
    try {
      socket = new WebSocket(wsUrl);
    } catch (err) {
      console.error('[WS] Failed to create WebSocket', err);
      this.scheduleReconnect();
      return;
    }

    this.ws = socket;

    socket.onopen = () => {
      console.log('[WS] Socket open — sending auth handshake');
      // Send auth token immediately after connection opens.
      // The server will validate and respond with connection.ready.
      socket.send(
        JSON.stringify({
          type: 'auth',
          token: this.token,
        }),
      );
      this.startPing(socket);
    };

    socket.onmessage = (evt: MessageEvent<string>) => {
      this.handleMessage(evt.data);
    };

    socket.onclose = (evt: CloseEvent) => {
      console.log('[WS] Socket closed', evt.code, evt.reason);
      this.isAuthenticated = false;
      this.clearPing();

      if (this.destroyed) return;

      // ⚠️  KEY FIX: Do NOT reset to idle/auth here.
      // Only set phase → 'connecting' to preserve token & game state.
      useStore.getState().reconnect();

      this.options.onDisconnect?.();
      this.scheduleReconnect();
    };

    socket.onerror = (evt) => {
      console.error('[WS] Socket error', evt);
      // onclose will fire automatically after onerror — let it handle reconnect
    };
  }

  private handleMessage(raw: string): void {
    let msg: ServerMsg;
    try {
      msg = JSON.parse(raw) as ServerMsg;
    } catch {
      console.warn('[WS] Received non-JSON message', raw);
      return;
    }

    this.options.onMessage?.(msg);

    switch (msg.type) {
      case 'connection.ready':
        this.handleConnectionReady(msg);
        break;
      case 'room.joined':
        this.emit('room.joined', msg);
        break;
      case 'room.players':
        this.emit('room.players', msg);
        break;
      case 'match.started':
        this.emit('match.started', msg);
        break;
      case 'state.snapshot':
        this.emit('state.snapshot', msg);
        break;
      case 'ack':
        this.emit('ack', msg);
        break;
      case 'error':
        this.emit('error', msg);
        break;
      case 'match.ended':
        this.emit('match.ended', msg);
        break;
      default:
        console.debug('[WS] Unknown message type', (msg as ServerMsg).type);
    }
  }

  private handleConnectionReady(msg: MsgConnectionReady): void {
    console.log('[WS] connection.ready received — transitioning to lobby/game');
    this.isAuthenticated = true;
    this.reconnectDelay = RECONNECT_DELAY_INITIAL_MS; // reset backoff on success

    // Advance store: 'connecting' → 'lobby' (or 'game' if mid-match)
    const store = useStore.getState();
    store.setReady(msg.payload.playerId, msg.payload.sessionId);

    // If we were mid-game, request a state sync to restore
    const { matchId, gameState } = useStore.getState();
    if (matchId) {
      this.send({
        type: 'sync.state',
        actionId: crypto.randomUUID(),
        payload: {
          matchId,
          knownStateVersion: gameState?.version ?? 0,
        },
      });
    }

    this.emit('ready', msg);
    this.options.onReady?.(msg);
  }

  private scheduleReconnect(): void {
    if (this.destroyed || !this.token) return;
    if (this.reconnectTimer) return; // already scheduled

    const jitter = Math.random() * RECONNECT_JITTER_MS;
    const delay = this.reconnectDelay + jitter;

    console.log(`[WS] Reconnecting in ${Math.round(delay)}ms`);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (!this.destroyed && this.token) {
        this.openSocket();
      }
    }, delay);

    // Exponential backoff
    this.reconnectDelay = Math.min(
      this.reconnectDelay * 2,
      RECONNECT_DELAY_MAX_MS,
    );
  }

  private startPing(socket: WebSocket): void {
    this.pingTimer = setInterval(() => {
      if (socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ type: 'presence.ping' }));
      }
    }, PING_INTERVAL_MS);
  }

  private clearPing(): void {
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
  }

  private clearTimers(): void {
    this.clearPing();
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  private buildUrl(): string {
    const base = this.options.url;
    if (base.startsWith('ws://') || base.startsWith('wss://')) return base;
    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${protocol}//${location.host}${base}`;
  }

  private emit<K extends keyof WsEventMap>(event: K, msg: WsEventMap[K]): void {
    const set = this.handlers.get(event);
    if (!set) return;
    set.forEach((handler) => {
      try {
        (handler as WsEventHandler<K>)(msg);
      } catch (err) {
        console.error(`[WS] Handler for "${event}" threw`, err);
      }
    });
  }
}

// ─── Singleton ─────────────────────────────────────────────────────────────────

let instance: WsClient | null = null;

export function getWsClient(): WsClient {
  if (!instance) {
    instance = new WsClient({
      url: import.meta.env.VITE_WS_URL ?? '/ws',
    });
  }
  return instance;
}
