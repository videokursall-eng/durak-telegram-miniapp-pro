import type { FastifyInstance } from 'fastify';
import crypto from 'crypto';
import { sessionStore } from '../store/sessionStore.js';

/** Generate a secure random auth token (URL-safe base64, ~32 bytes). */
function generateToken(): string {
  return crypto.randomBytes(32).toString('base64url');
}

/**
 * Verify Telegram initData HMAC signature.
 * @see https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
 */
function verifyTelegramInitData(initData: string, botToken: string): boolean {
  const params = new URLSearchParams(initData);
  const hash = params.get('hash');
  if (!hash) return false;

  params.delete('hash');

  const dataCheckString = [...params.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join('\n');

  const secretKey = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
  const expectedHash = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');

  try {
    return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(expectedHash, 'hex'));
  } catch {
    // Buffer.from(hex) throws on odd-length / invalid hex strings
    return false;
  }
}

/** Parse user object from Telegram initData. */
function parseTelegramUser(
  initData: string,
): { id: string; username?: string; firstName?: string } | null {
  const params = new URLSearchParams(initData);
  const userStr = params.get('user');
  if (!userStr) return null;
  try {
    const user = JSON.parse(userStr) as Record<string, unknown>;
    const id = String(user['id'] ?? '');
    if (!id) return null;
    return {
      id,
      username: typeof user['username'] === 'string' ? user['username'] : undefined,
      firstName: typeof user['first_name'] === 'string' ? user['first_name'] : undefined,
    };
  } catch {
    return null;
  }
}

export function registerAuthRoutes(fastify: FastifyInstance): void {
  const botToken = process.env['TELEGRAM_BOT_TOKEN'] ?? '';
  const isDev = process.env['NODE_ENV'] !== 'production';

  fastify.get('/health', async () => ({ ok: true }));

  fastify.post<{
    Body: { initData: string };
  }>('/auth/telegram', {
    schema: {
      body: {
        type: 'object',
        required: ['initData'],
        properties: {
          initData: { type: 'string' },
        },
      },
    },
    handler: async (req, reply) => {
      const { initData } = req.body;

      let user: { id: string; username?: string; firstName?: string } | null;

      if (isDev && initData === 'mock') {
        // Dev mode: accept mock initData for local development
        user = { id: '0', username: 'dev', firstName: 'Dev' };
      } else {
        if (!botToken) {
          req.log.error('TELEGRAM_BOT_TOKEN is not set');
          return reply.status(500).send({ error: 'Server misconfiguration' });
        }
        if (!verifyTelegramInitData(initData, botToken)) {
          req.log.warn({ initData: initData.slice(0, 40) }, 'Telegram initData verification failed');
          return reply.status(401).send({ error: 'Invalid initData' });
        }
        user = parseTelegramUser(initData);
        if (!user) {
          return reply.status(400).send({ error: 'Missing user in initData' });
        }
      }

      const token = generateToken();
      sessionStore.set(token, {
        telegramUserId: user.id,
        username: user.username,
        firstName: user.firstName,
      });

      req.log.info({ telegramUserId: user.id }, 'Telegram auth success');

      return {
        token,
        user: { id: user.id, username: user.username, firstName: user.firstName },
      };
    },
  });
}
