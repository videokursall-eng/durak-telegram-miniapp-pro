/**
 * In-memory rate limiter: sliding window per key.
 * Used to limit room create/join/start and WS actions per user/connection.
 */

type Entry = { count: number; windowStart: number };

export type RateLimitConfig = {
  maxCount: number;
  windowMs: number;
};

const defaultConfig: RateLimitConfig = {
  maxCount: 10,
  windowMs: 60_000,
};

export class RateLimiter {
  private readonly store = new Map<string, Entry>();
  private readonly config: RateLimitConfig;

  constructor(config: Partial<RateLimitConfig> = {}) {
    this.config = { ...defaultConfig, ...config };
  }

  /**
   * Returns true if the key is within limit, false if rate limited.
   * Call this before performing the action.
   */
  check(key: string): boolean {
    const now = Date.now();
    const { maxCount, windowMs } = this.config;
    let entry = this.store.get(key);

    if (!entry) {
      this.store.set(key, { count: 1, windowStart: now });
      return true;
    }

    if (now - entry.windowStart >= windowMs) {
      entry = { count: 1, windowStart: now };
      this.store.set(key, entry);
      return true;
    }

    if (entry.count >= maxCount) {
      return false;
    }

    entry.count += 1;
    return true;
  }

  /** Remove old entries to avoid unbounded growth (call periodically). */
  prune(maxAgeMs: number = this.config.windowMs * 2) {
    const now = Date.now();
    for (const [key, entry] of this.store.entries()) {
      if (now - entry.windowStart > maxAgeMs) {
        this.store.delete(key);
      }
    }
  }
}

/** Limits per key: e.g. "create:telegramUserId", "join:telegramUserId", "action:connectionId". */
export function createRoomRateLimiters() {
  return {
    createRoom: new RateLimiter({ maxCount: 8, windowMs: 60_000 }),
    joinRoom: new RateLimiter({ maxCount: 15, windowMs: 60_000 }),
    startRoom: new RateLimiter({ maxCount: 10, windowMs: 60_000 }),
    reconnect: new RateLimiter({ maxCount: 10, windowMs: 60_000 }),
    action: new RateLimiter({ maxCount: 120, windowMs: 60_000 }),
  };
}
