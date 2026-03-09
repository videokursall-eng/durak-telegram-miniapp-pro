/**
 * In-memory session store.
 * Maps auth token → session data.
 * In production this would be replaced with a Redis store.
 */

export interface AuthSession {
  telegramUserId: string;
  username?: string;
  firstName?: string;
  token: string;
  createdAt: number;
  /** TTL in milliseconds (default: 24 hours) */
  ttlMs: number;
}

const TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

class SessionStore {
  private readonly store = new Map<string, AuthSession>();

  set(token: string, session: Omit<AuthSession, 'token' | 'createdAt' | 'ttlMs'>): AuthSession {
    const full: AuthSession = {
      ...session,
      token,
      createdAt: Date.now(),
      ttlMs: TTL_MS,
    };
    this.store.set(token, full);
    return full;
  }

  get(token: string): AuthSession | null {
    const session = this.store.get(token);
    if (!session) return null;
    if (Date.now() - session.createdAt > session.ttlMs) {
      this.store.delete(token);
      return null;
    }
    return session;
  }

  delete(token: string): void {
    this.store.delete(token);
  }

  /** Remove expired sessions (call periodically). */
  purgeExpired(): number {
    let count = 0;
    const now = Date.now();
    for (const [token, session] of this.store) {
      if (now - session.createdAt > session.ttlMs) {
        this.store.delete(token);
        count++;
      }
    }
    return count;
  }
}

export const sessionStore = new SessionStore();
