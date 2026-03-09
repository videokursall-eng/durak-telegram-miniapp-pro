/**
 * Fastify server entry point.
 */

import Fastify from 'fastify';
import cors from '@fastify/cors';
import websocket from '@fastify/websocket';
import { registerAuthRoutes } from './http/auth';
import { registerWsGateway } from './ws/gateway';

const PORT = Number(process.env.PORT ?? 3000);
const HOST = process.env.HOST ?? '0.0.0.0';

async function start() {
  const app = Fastify({
    logger: {
      level: process.env.LOG_LEVEL ?? 'info',
    },
  });

  // ── Plugins ──────────────────────────────────────────────────────────────────
  await app.register(cors, {
    origin: process.env.CORS_ORIGIN ?? '*',
    methods: ['GET', 'POST', 'OPTIONS'],
  });

  await app.register(websocket, {
    options: {
      maxPayload: 64 * 1024, // 64 KB
    },
  });

  // ── Routes ───────────────────────────────────────────────────────────────────
  await registerAuthRoutes(app);
  await registerWsGateway(app);

  app.get('/healthz', async () => ({ ok: true, ts: Date.now() }));

  // ── Start ────────────────────────────────────────────────────────────────────
  try {
    await app.listen({ port: PORT, host: HOST });
    app.log.info(`Server listening on ${HOST}:${PORT}`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

start();
