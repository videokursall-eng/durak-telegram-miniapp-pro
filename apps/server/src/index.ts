import 'dotenv/config';
import Fastify from 'fastify';
import fastifyWebsocket from '@fastify/websocket';
import { registerAuthRoutes } from './http/auth.js';
import { registerWsGateway } from './ws/gateway.js';
import { sessionStore } from './store/sessionStore.js';

const host = process.env['HOST'] ?? '127.0.0.1';
const port = Number(process.env['PORT'] ?? 8080);

const fastify = Fastify({
  logger: {
    level: process.env['LOG_LEVEL'] ?? 'info',
  },
});

await fastify.register(fastifyWebsocket);

registerAuthRoutes(fastify);
registerWsGateway(fastify);

// Periodically purge expired auth sessions (every 10 minutes)
setInterval(() => {
  const removed = sessionStore.purgeExpired();
  if (removed > 0) {
    fastify.log.info({ removed }, 'purged expired auth sessions');
  }
}, 10 * 60 * 1000);

await fastify.listen({ host, port });
console.log(`Server listening at http://${host}:${port}`);
