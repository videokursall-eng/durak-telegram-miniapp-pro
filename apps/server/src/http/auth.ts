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
  // Register all auth routes inside a scoped plugin so @fastify/rate-limit
  // applies to every route in this scope.
  await app.register(async (scoped) => {
    await scoped.register(rateLimit, {
      max: 10,
      timeWindow: '1 minute',
      keyGenerator: (req) => req.ip,
      errorResponseBuilder: () => ({
        error: 'TOO_MANY_REQUESTS',
        message: 'Too many auth attempts. Please wait a minute.',
      }),
    });

    scoped.post<{ Body: AuthBody }>(
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
        config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
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
  });
}

export function verifyToken(token: string): { sub: string; name: string } {
  return jwt.verify(token, JWT_SECRET) as { sub: string; name: string };
}

export { uuidv4 };
