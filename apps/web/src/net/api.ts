/**
 * REST API client.
 * All calls go through /api to be proxied to the server in development.
 */

import type { AuthResponse } from '@durak/shared';

const BASE = import.meta.env.VITE_API_URL ?? '/api';

async function request<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
    ...options,
  });

  if (!res.ok) {
    let errMsg = `HTTP ${res.status}`;
    try {
      const body = await res.json() as { message?: string; error?: string };
      errMsg = body.message ?? body.error ?? errMsg;
    } catch {
      // ignore parse error
    }
    throw new Error(errMsg);
  }

  return res.json() as Promise<T>;
}

/**
 * POST /auth/telegram
 *
 * Exchanges Telegram initData for a server-signed JWT.
 * Call this ONCE at startup. On reconnect, reuse the stored token.
 */
export async function authTelegram(initData: string): Promise<AuthResponse> {
  return request<AuthResponse>('/auth/telegram', {
    method: 'POST',
    body: JSON.stringify({ initData }),
  });
}

/**
 * GET /rooms
 * Returns list of available rooms.
 */
export async function getRooms(token: string) {
  return request<{ rooms: unknown[] }>('/rooms', {
    headers: { Authorization: `Bearer ${token}` },
  });
}
