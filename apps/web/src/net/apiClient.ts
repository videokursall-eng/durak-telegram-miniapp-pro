const BASE_URL = (import.meta as Record<string, unknown>)['env'] !== undefined
  ? (import.meta as { env: Record<string, string> }).env['VITE_API_URL'] ?? ''
  : '';

export interface AuthResponse {
  token: string;
  user: { id: string; username?: string; firstName?: string };
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`HTTP ${res.status}: ${text}`);
  }
  return res.json() as Promise<T>;
}

/**
 * Authenticate with the server using Telegram initData.
 * Returns the auth token to be used for WebSocket connection.
 */
export async function authTelegram(initData: string): Promise<AuthResponse> {
  return post<AuthResponse>('/auth/telegram', { initData });
}
