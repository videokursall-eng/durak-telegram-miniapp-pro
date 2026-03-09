import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { WebSocket } from '@fastify/websocket';
import { registry } from './registry.js';
import { sessionStore } from '../store/sessionStore.js';

/** Generate a random suffix for connection IDs. */
function randomSuffix(): string {
  return Math.random().toString(36).slice(2, 8);
}

/** Registered message handlers keyed by message type. */
type MessageHandler = (
  socket: WebSocket,
  connectionId: string,
  payload: Record<string, unknown>,
  log: FastifyInstance['log'],
) => void | Promise<void>;

const handlers = new Map<string, MessageHandler>();

export function registerHandler(type: string, fn: MessageHandler): void {
  handlers.set(type, fn);
}

export function registerWsGateway(fastify: FastifyInstance): void {
  fastify.get(
    '/ws',
    { websocket: true },
    async (socket: WebSocket, req: FastifyRequest) => {
      // ---------- auth ----------
      const query = req.query as Record<string, string>;
      const token =
        query['token'] ?? (req.headers['authorization'] ?? '').replace(/^Bearer\s+/i, '');

      const session = token ? sessionStore.get(token) : null;
      if (!session) {
        req.log.warn({ wsAuthSource: query['token'] ? 'query' : 'header' }, 'ws auth failed');
        socket.close(4001, 'unauthorized');
        return;
      }

      const connectionId = `conn_${Date.now()}_${randomSuffix()}`;
      const wsAuthSource = query['token'] ? 'query' : 'header';

      req.log.info(
        {
          connectionId,
          wsAuthSource,
          tokenLength: token.length,
          tokenPreview: `${token.slice(0, 6)}…`,
          authSessionFound: true,
        },
        'ws auth verify',
      );

      req.log.info(
        { connectionId, path: '/ws', telegramUserId: session.telegramUserId },
        'websocket auth success',
      );

      // ---------- register (replaces any old connection for this user) ----------
      registry.add(
        {
          telegramUserId: session.telegramUserId,
          connectionId,
          socket,
          connectedAt: Date.now(),
        },
        fastify.log,
      );

      // ---------- send ready ----------
      send(socket, { type: 'connection.ready', connectionId });
      req.log.info({ connectionId }, 'connection.ready sent');

      // ---------- message routing ----------
      socket.on('message', (raw: Buffer | string) => {
        let msg: Record<string, unknown>;
        try {
          msg = JSON.parse(raw.toString()) as Record<string, unknown>;
        } catch {
          send(socket, { type: 'error', code: 'BAD_JSON', message: 'Invalid JSON' });
          return;
        }

        const type = typeof msg['type'] === 'string' ? msg['type'] : '';
        const handler = handlers.get(type);
        if (!handler) {
          send(socket, {
            type: 'error',
            code: 'UNKNOWN_TYPE',
            message: `Unknown message type: ${type}`,
          });
          return;
        }

        Promise.resolve(handler(socket, connectionId, msg, fastify.log)).catch((err: unknown) => {
          fastify.log.error({ connectionId, err }, 'ws handler error');
          send(socket, { type: 'error', code: 'INTERNAL', message: 'Internal error' });
        });
      });

      // ---------- cleanup ----------
      socket.on('close', () => {
        req.log.info({ connectionId, telegramUserId: session.telegramUserId }, 'ws connection closed');
        registry.remove(connectionId);
      });

      socket.on('error', (err: Error) => {
        req.log.error({ connectionId, err }, 'ws error');
        registry.remove(connectionId);
      });
    },
  );
}

function send(socket: WebSocket, data: unknown): void {
  if (socket.readyState === socket.OPEN) {
    socket.send(JSON.stringify(data));
  }
}
