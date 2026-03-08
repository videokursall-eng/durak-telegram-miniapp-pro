import { randomBytes } from "node:crypto";
import type { TelegramUserIdentity, TrustedAuthSession } from "./types";

const DEFAULT_TOKEN_TTL_SECONDS = 86400;

type AuthSessionStoreOptions = {
  ttlSeconds?: number;
  nowMs?: () => number;
};

export class AuthSessionStore {
  private sessions = new Map<string, TrustedAuthSession>();
  private ttlSeconds: number;
  private nowMs: () => number;

  constructor(options: AuthSessionStoreOptions = {}) {
    this.ttlSeconds = options.ttlSeconds ?? DEFAULT_TOKEN_TTL_SECONDS;
    this.nowMs = options.nowMs ?? (() => Date.now());
  }

  issue(user: TelegramUserIdentity): TrustedAuthSession {
    const issuedAt = this.nowMs();
    const session: TrustedAuthSession = {
      token: randomBytes(32).toString("base64url"),
      user,
      issuedAt,
      expiresAt: issuedAt + this.ttlSeconds * 1000,
    };

    this.sessions.set(session.token, session);
    return session;
  }

  verify(token: string | null | undefined): TrustedAuthSession | null {
    if (!token) {
      return null;
    }

    const session = this.sessions.get(token);
    if (!session) {
      return null;
    }

    if (session.expiresAt <= this.nowMs()) {
      this.sessions.delete(token);
      return null;
    }

    return session;
  }

  revoke(token: string) {
    this.sessions.delete(token);
  }
}
