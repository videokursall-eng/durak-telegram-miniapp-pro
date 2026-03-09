import type { FastifyInstance } from 'fastify';
import type { WebSocket } from '@fastify/websocket';

export interface WsSession {
  telegramUserId: string;
  connectionId: string;
  socket: WebSocket;
  connectedAt: number;
}

/**
 * In-memory registry of active WebSocket connections.
 * Enforces one-connection-per-user: when a user opens a new connection
 * while an old one is still live, the old connection is cleanly closed.
 * This prevents client-side reconnection storms from accumulating
 * multiple stale sessions on the server.
 */
export class WsRegistry {
  /** Map from telegramUserId → active WsSession */
  private readonly byUser = new Map<string, WsSession>();
  /** Map from connectionId → telegramUserId (reverse lookup for cleanup) */
  private readonly byConn = new Map<string, string>();

  /**
   * Register a new WebSocket connection for a user.
   * If the user already has an active connection, the old socket is closed
   * before the new one is registered.
   */
  add(session: WsSession, log: FastifyInstance['log']): void {
    const existing = this.byUser.get(session.telegramUserId);
    if (existing) {
      log.info(
        {
          telegramUserId: session.telegramUserId,
          oldConnectionId: existing.connectionId,
          newConnectionId: session.connectionId,
        },
        'replacing existing WS connection for user',
      );
      this.close(existing, 1001, 'replaced by new connection');
    }
    this.byUser.set(session.telegramUserId, session);
    this.byConn.set(session.connectionId, session.telegramUserId);
  }

  /** Remove a connection from the registry (called on socket close). */
  remove(connectionId: string): void {
    const userId = this.byConn.get(connectionId);
    if (!userId) return;
    this.byConn.delete(connectionId);
    const session = this.byUser.get(userId);
    if (session && session.connectionId === connectionId) {
      this.byUser.delete(userId);
    }
  }

  get(connectionId: string): WsSession | undefined {
    const userId = this.byConn.get(connectionId);
    return userId ? this.byUser.get(userId) : undefined;
  }

  getByUser(telegramUserId: string): WsSession | undefined {
    return this.byUser.get(telegramUserId);
  }

  /** Safely close a WebSocket with a code and reason. */
  private close(session: WsSession, code: number, reason: string): void {
    try {
      if (session.socket.readyState === session.socket.OPEN) {
        session.socket.close(code, reason);
      }
    } catch {
      // ignore errors on close
    }
  }

  get size(): number {
    return this.byUser.size;
  }
}

export const registry = new WsRegistry();
