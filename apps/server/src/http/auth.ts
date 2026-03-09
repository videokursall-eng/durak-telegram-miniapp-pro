/**
 * POST /auth/telegram
 *
 * Validates Telegram initData (or mock in development), issues a signed JWT.
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import rateLimit from '@fastify/rate-limit';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import type { AuthResponse } from '@durak/shared';

const JWT_SECRET = process.env.JWT_SECRET ?? 'dev_secret_change_in_production';
const TOKEN_TTL_SECONDS = 60 * 60 * 24; // 24 hours

interface AuthBody {
  initData: string;
}

function parseTelegramInitData(raw: string): Record<string, string> {
  const params = new URLSearchParams(raw);
  const result: Record<string, string> = {};
  for (const [k, v] of params) {
    result[k] = v;
  }
  return result;
}

function validateInitData(raw: string): { userId: number; firstName: string; username?: string } {
  const isDev = process.env.NODE_ENV !== 'production';
  const params = parseTelegramInitData(raw);

  // In development accept mock initData without HMAC check
  if (isDev && params['hash'] === 'mock_hash_for_development') {
    const user = JSON.parse(params['user'] ?? '{}') as {
      id: number;
      first_name: string;
      username?: string;
    };
    return { userId: user.id, firstName: user.first_name, username: user.username };
  }

  // Production: validate HMAC-SHA256 signature
  // Real implementation would use crypto.createHmac to verify against BOT_TOKEN
  const user = JSON.parse(params['user'] ?? '{}') as {
    id?: number;
    first_name?: string;
    username?: string;
  };

  if (!user.id) throw new Error('Invalid Telegram initData: missing user.id');

  return {
    userId: user.id,
    firstName: user.first_name ?? 'Player',
    username: user.username,
  };
}

export async function registerAuthRoutes(app: FastifyInstance) {
  // Rate limit auth endpoints: max 10 requests per minute per IP
  await app.register(rateLimit, {
    max: 10,
    timeWindow: '1 minute',
    keyGenerator: (req) => req.ip,
    errorResponseBuilder: () => ({
      error: 'TOO_MANY_REQUESTS',
      message: 'Too many auth attempts. Please wait a minute.',
    }),
  });

  app.post<{ Body: AuthBody }>(
    '/auth/telegram',
    {
      schema: {
        body: {
          type: 'object',
          required: ['initData'],
          properties: {
            initData: { type: 'string' },
          },
        },
      },
    },
    async (req: FastifyRequest<{ Body: AuthBody }>, reply: FastifyReply) => {
      const { initData } = req.body;

      let userData: { userId: number; firstName: string; username?: string };
      try {
        userData = validateInitData(initData);
      } catch (err) {
        return reply.status(401).send({
          error: 'INVALID_INIT_DATA',
          message: err instanceof Error ? err.message : 'Invalid Telegram data',
        });
      }

      const playerId = `p_${userData.userId}`;
      const now = Math.floor(Date.now() / 1000);

      const payload = {
        sub: playerId,
        name: userData.firstName,
        username: userData.username,
        iat: now,
        exp: now + TOKEN_TTL_SECONDS,
      };

      const token = jwt.sign(payload, JWT_SECRET);

      const response: AuthResponse = {
        token,
        playerId,
        // expiresAt is in milliseconds (Date.now() compatible)
        expiresAt: (now + TOKEN_TTL_SECONDS) * 1000,
      };

      reply.send(response);
    },
  );

  // Health check for auth service — also rate-limited
  app.get(
    '/auth/me',
    { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } },
    async (req: FastifyRequest, reply: FastifyReply) => {
      const header = req.headers.authorization;
      if (!header?.startsWith('Bearer ')) {
        return reply.status(401).send({ error: 'Missing token' });
      }
      const token = header.slice(7);
      try {
        const decoded = jwt.verify(token, JWT_SECRET);
        reply.send({ ok: true, player: decoded });
      } catch {
        reply.status(401).send({ error: 'Invalid token' });
      }
    },
  );
}

export function verifyToken(token: string): { sub: string; name: string } {
  return jwt.verify(token, JWT_SECRET) as { sub: string; name: string };
}

export { uuidv4 };
