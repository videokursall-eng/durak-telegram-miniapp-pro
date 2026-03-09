/**
 * WebSocket gateway.
 *
 * Protocol:
 *  1. Client connects → sends { type: 'auth', token: '...' }
 *  2. Server validates JWT → sends connection.ready
 *  3. Client sends game messages, server responds with ack / state.snapshot
 */

import type { FastifyInstance } from 'fastify';
import type { SocketStream } from '@fastify/websocket';
import type { ClientMsg, MsgConnectionReady, MsgRoomJoined, MsgRoomPlayers } from '@durak/shared';
import { verifyToken } from '../http/auth';
import {
  getOrCreateDefaultRoom,
  getRoom,
  addPlayerToRoom,
  removePlayerFromRoom,
  roomToInfo,
} from './roomManager';
import { v4 as uuidv4 } from 'uuid';

interface AuthedConnection {
  ws: SocketStream['socket'];
  playerId: string;
  playerName: string;
  sessionId: string;
  roomId: string | null;
}

// playerId → connection
const connections = new Map<string, AuthedConnection>();

function sendTo(conn: AuthedConnection, msg: object): void {
  if (conn.ws.readyState === conn.ws.OPEN) {
    conn.ws.send(JSON.stringify(msg));
  }
}

function broadcastToRoom(roomId: string, msg: object, excludePlayerId?: string): void {
  for (const conn of connections.values()) {
    if (conn.roomId === roomId && conn.playerId !== excludePlayerId) {
      sendTo(conn, msg);
    }
  }
}

export async function registerWsGateway(app: FastifyInstance) {
  app.get('/ws', { websocket: true }, (connection: SocketStream, _req) => {
    const ws = connection.socket;
    let conn: AuthedConnection | null = null;

    ws.on('message', (rawData: Buffer | string) => {
      let msg: Record<string, unknown>;
      try {
        msg = JSON.parse(rawData.toString()) as Record<string, unknown>;
      } catch {
        ws.send(JSON.stringify({ type: 'error', code: 'INVALID_JSON', message: 'Invalid JSON' }));
        return;
      }

      // ── Auth handshake ─────────────────────────────────────────────────────
      if (msg.type === 'auth') {
        try {
          const token = msg.token as string;
          const payload = verifyToken(token);
          const sessionId = uuidv4();

          conn = {
            ws,
            playerId: payload.sub,
            playerName: payload.name,
            sessionId,
            roomId: null,
          };
          connections.set(payload.sub, conn);

          // ✅ KEY: Send connection.ready — client must handle this to leave 'connecting' phase
          const readyMsg: MsgConnectionReady = {
            type: 'connection.ready',
            payload: { playerId: payload.sub, sessionId },
          };
          sendTo(conn, readyMsg);
          app.log.info(`[WS] Player ${payload.sub} authenticated (session ${sessionId})`);
        } catch (err) {
          ws.send(
            JSON.stringify({
              type: 'error',
              code: 'AUTH_FAILED',
              message: err instanceof Error ? err.message : 'Authentication failed',
            }),
          );
          ws.close(1008, 'auth failed');
        }
        return;
      }

      // All subsequent messages require auth
      if (!conn) {
        ws.send(JSON.stringify({ type: 'error', code: 'NOT_AUTHENTICATED', message: 'Send auth first' }));
        return;
      }

      handleGameMessage(conn, msg as unknown as ClientMsg);
    });

    ws.on('close', () => {
      if (!conn) return;
      app.log.info(`[WS] Player ${conn.playerId} disconnected`);

      // Remove from room
      if (conn.roomId) {
        removePlayerFromRoom(conn.roomId, conn.playerId);
        const room = getRoom(conn.roomId);
        if (room) {
          broadcastToRoom(conn.roomId, {
            type: 'room.players',
            payload: { players: room.players },
          } satisfies MsgRoomPlayers);
        }
      }
      connections.delete(conn.playerId);
    });

    ws.on('error', (err: Error) => {
      app.log.error({ err }, '[WS] socket error');
    });
  });
}

function handleGameMessage(conn: AuthedConnection, msg: ClientMsg): void {
  switch (msg.type) {
    case 'room.join':
      handleRoomJoin(conn, msg.payload);
      break;

    case 'room.start':
      handleRoomStart(conn, msg.payload);
      break;

    case 'sync.state':
      handleSyncState(conn, msg.payload);
      break;

    case 'presence.ping' as ClientMsg['type']:
      sendTo(conn, { type: 'presence.pong' });
      break;

    case 'turn.attack':
    case 'turn.defend':
    case 'turn.throwIn':
    case 'turn.transfer':
    case 'turn.take':
    case 'turn.beat':
    case 'turn.pass':
      handleTurnAction(conn, msg);
      break;

    default:
      sendTo(conn, {
        type: 'error',
        code: 'UNKNOWN_MESSAGE',
        message: `Unknown message type: ${(msg as ClientMsg).type}`,
      });
  }
}

function handleRoomJoin(conn: AuthedConnection, payload: { roomId: string; authToken: string }): void {
  const roomId = payload.roomId;
  // Prefer existing room, fall back to default
  const room = getRoom(roomId) ?? getOrCreateDefaultRoom();
  const joined = addPlayerToRoom(room.id, {
    id: conn.playerId,
    name: conn.playerName,
    isReady: false,
    isOwner: false,
  });

  if (!joined) {
    sendTo(conn, {
      type: 'error',
      code: 'ROOM_FULL',
      message: 'Room is full or closed',
    });
    return;
  }

  conn.roomId = room.id;

  const joinedMsg: MsgRoomJoined = {
    type: 'room.joined',
    payload: { room: roomToInfo(room), selfPlayerId: conn.playerId },
  };
  sendTo(conn, joinedMsg);

  // Broadcast updated player list to all in room
  broadcastToRoom(room.id, {
    type: 'room.players',
    payload: { players: room.players },
  } satisfies MsgRoomPlayers);
}

function handleRoomStart(
  conn: AuthedConnection,
  payload: { mode: string; maxPlayers: number },
): void {
  if (!conn.roomId) {
    sendTo(conn, { type: 'error', code: 'NOT_IN_ROOM', message: 'Join a room first' });
    return;
  }
  const room = getRoom(conn.roomId);
  if (!room) return;

  const isOwner = room.players.find((p) => p.id === conn.playerId)?.isOwner;
  if (!isOwner) {
    sendTo(conn, { type: 'error', code: 'NOT_OWNER', message: 'Only the room owner can start' });
    return;
  }
  if (room.players.length < 2) {
    sendTo(conn, { type: 'error', code: 'NOT_ENOUGH_PLAYERS', message: 'Need at least 2 players' });
    return;
  }

  const matchId = `m_${uuidv4().slice(0, 8)}`;
  room.matchId = matchId;
  room.isOpen = false;
  room.mode = (payload.mode as 'simple' | 'transfer') ?? 'simple';

  // Build a minimal initial game state (real engine would be in packages/rules)
  const attackerIndex = 0;
  const defenderIndex = 1;
  const initialState = {
    matchId,
    version: 1,
    phase: 'TRICK_ATTACK' as const,
    mode: room.mode,
    trump: 'S' as const,
    deckCount: 36 - room.players.length * 6,
    table: [],
    players: room.players.map((p, i) => ({
      id: p.id,
      name: p.name,
      cardCount: 6,
      cards: [],
      isConnected: true,
      isReady: true,
    })),
    attackerIndex,
    defenderIndex,
    currentTurnPlayerId: room.players[attackerIndex].id,
    discardCount: 0,
  };

  broadcastToRoom(conn.roomId, {
    type: 'match.started',
    payload: { matchId, mode: room.mode, state: initialState },
  });
}

function handleSyncState(conn: AuthedConnection, payload: { matchId: string; knownStateVersion: number }): void {
  if (!conn.roomId) {
    sendTo(conn, { type: 'error', code: 'NOT_IN_ROOM', message: 'Not in a room' });
    return;
  }
  const room = getRoom(conn.roomId);
  if (!room || room.matchId !== payload.matchId) {
    sendTo(conn, {
      type: 'error',
      code: 'MATCH_NOT_FOUND',
      message: `Match ${payload.matchId} not found`,
    });
    return;
  }

  // In a real server this would fetch the authoritative GameState from a persistent store.
  // Here we return an error so the client knows the state is unavailable (server restarted).
  sendTo(conn, {
    type: 'error',
    code: 'STATE_UNAVAILABLE',
    message: 'Game state not available — server may have restarted',
  });
}

function handleTurnAction(conn: AuthedConnection, msg: ClientMsg): void {
  if (!conn.roomId) return;
  // Acknowledge the action — real server would run the rules engine here
  sendTo(conn, {
    type: 'ack',
    actionId: msg.actionId,
    matchId: msg.matchId,
    ok: true,
    stateVersion: 1,
  });
}
