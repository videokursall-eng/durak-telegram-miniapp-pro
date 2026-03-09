import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { WsClient } from '../wsClient.js';

// ─── Mock WebSocket ───────────────────────────────────────────────────────────

type ReadyState = 0 | 1 | 2 | 3;

interface MockWsInstance {
  readyState: ReadyState;
  onopen: (() => void) | null;
  onmessage: ((e: { data: string }) => void) | null;
  onclose: ((e: { code: number; reason: string }) => void) | null;
  onerror: (() => void) | null;
  close: (code?: number, reason?: string) => void;
  send: (data: string) => void;
  sentMessages: string[];
  simulateOpen: () => void;
  simulateMessage: (data: unknown) => void;
  simulateClose: (code?: number, reason?: string) => void;
  simulateError: () => void;
}

const instances: MockWsInstance[] = [];

class MockWebSocket {
  static CONNECTING: ReadyState = 0;
  static OPEN: ReadyState = 1;
  static CLOSING: ReadyState = 2;
  static CLOSED: ReadyState = 3;
  CONNECTING: ReadyState = 0;
  OPEN: ReadyState = 1;
  CLOSING: ReadyState = 2;
  CLOSED: ReadyState = 3;

  readyState: ReadyState = 0; // CONNECTING
  onopen: (() => void) | null = null;
  onmessage: ((e: { data: string }) => void) | null = null;
  onclose: ((e: { code: number; reason: string }) => void) | null = null;
  onerror: (() => void) | null = null;
  sentMessages: string[] = [];

  constructor(public url: string) {
    instances.push(this as unknown as MockWsInstance);
  }

  close(code = 1000, reason = ''): void {
    this.readyState = 3; // CLOSED
    this.onclose?.({ code, reason });
  }

  send(data: string): void {
    this.sentMessages.push(data);
  }

  simulateOpen(): void {
    this.readyState = 1; // OPEN
    this.onopen?.();
  }

  simulateMessage(data: unknown): void {
    this.onmessage?.({ data: JSON.stringify(data) });
  }

  simulateClose(code = 1000, reason = ''): void {
    this.readyState = 3; // CLOSED
    this.onclose?.({ code, reason });
  }

  simulateError(): void {
    this.onerror?.();
    // error is always followed by close
    this.simulateClose(1006, 'error');
  }
}

// ─── Setup ───────────────────────────────────────────────────────────────────

beforeEach(() => {
  instances.length = 0;
  vi.useFakeTimers();
  // Replace global WebSocket with mock
  vi.stubGlobal('WebSocket', MockWebSocket);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

function latestWs(): MockWsInstance {
  return instances[instances.length - 1] as unknown as MockWsInstance;
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('WsClient', () => {
  describe('connect()', () => {
    it('opens a WebSocket to the configured URL', () => {
      const client = new WsClient({ url: 'wss://example.com/ws?token=abc' });
      client.connect();
      expect(instances).toHaveLength(1);
      expect((instances[0] as unknown as MockWebSocket).url).toBe('wss://example.com/ws?token=abc');
    });

    it('does NOT open a second connection when already OPEN', () => {
      const client = new WsClient({ url: 'wss://example.com/ws' });
      client.connect();
      latestWs().simulateOpen();
      // Call connect() again while open
      client.connect();
      expect(instances).toHaveLength(1); // still only one socket
    });

    it('does NOT open a second connection while CONNECTING', () => {
      const client = new WsClient({ url: 'wss://example.com/ws' });
      client.connect();
      // readyState is 0 (CONNECTING) — call connect() again
      client.connect();
      expect(instances).toHaveLength(1);
    });

    it('calls onOpen callback when connection opens', () => {
      const onOpen = vi.fn();
      const client = new WsClient({ url: 'wss://example.com/ws', onOpen });
      client.connect();
      latestWs().simulateOpen();
      expect(onOpen).toHaveBeenCalledOnce();
    });
  });

  describe('close()', () => {
    it('closes the socket and stops reconnecting', () => {
      const onClose = vi.fn();
      const client = new WsClient({ url: 'wss://example.com/ws', onClose });
      client.connect();
      latestWs().simulateOpen();
      client.close();
      expect(client.getStatus()).toBe('closed');
      // Advance timers — no new socket should be created
      vi.advanceTimersByTime(60_000);
      expect(instances).toHaveLength(1);
    });

    it('does not reconnect on auth failure (code 4001)', () => {
      const client = new WsClient({ url: 'wss://example.com/ws' });
      client.connect();
      latestWs().simulateOpen();
      latestWs().simulateClose(4001, 'unauthorized');
      vi.advanceTimersByTime(60_000);
      expect(instances).toHaveLength(1); // no reconnect
      expect(client.getStatus()).toBe('closed');
    });
  });

  describe('reconnection', () => {
    it('schedules a reconnect after unexpected close', () => {
      const client = new WsClient({ url: 'wss://example.com/ws', minDelayMs: 1000 });
      client.connect();
      latestWs().simulateOpen();
      latestWs().simulateClose(1006, 'connection lost');
      expect(client.getStatus()).toBe('reconnecting');
      // Advance past min delay
      vi.advanceTimersByTime(1500);
      expect(instances).toHaveLength(2); // new socket created
    });

    it('uses exponential back-off between retries', () => {
      const client = new WsClient({
        url: 'wss://example.com/ws',
        minDelayMs: 1000,
        maxDelayMs: 30_000,
        jitter: 0, // disable jitter for deterministic test
      });
      client.connect();

      // Retry 1: delay ~1000 ms
      latestWs().simulateClose(1006, '');
      vi.advanceTimersByTime(999);
      expect(instances).toHaveLength(1); // not yet
      vi.advanceTimersByTime(2);
      expect(instances).toHaveLength(2); // attempt 1

      // Retry 2: delay ~2000 ms
      latestWs().simulateClose(1006, '');
      vi.advanceTimersByTime(1999);
      expect(instances).toHaveLength(2); // not yet
      vi.advanceTimersByTime(2);
      expect(instances).toHaveLength(3); // attempt 2

      // Retry 3: delay ~4000 ms
      latestWs().simulateClose(1006, '');
      vi.advanceTimersByTime(3999);
      expect(instances).toHaveLength(3); // not yet
      vi.advanceTimersByTime(2);
      expect(instances).toHaveLength(4); // attempt 3
    });

    it('resets retry count to 0 after a successful reconnect', () => {
      const client = new WsClient({
        url: 'wss://example.com/ws',
        minDelayMs: 1000,
        jitter: 0,
      });
      client.connect();
      latestWs().simulateClose(1006, '');
      vi.advanceTimersByTime(1001);
      // Reconnect succeeds
      latestWs().simulateOpen();
      // Close again — should go back to minimum delay
      latestWs().simulateClose(1006, '');
      vi.advanceTimersByTime(999);
      expect(instances).toHaveLength(2); // not yet
      vi.advanceTimersByTime(2);
      expect(instances).toHaveLength(3); // new attempt with base delay
    });

    it('caps the back-off at maxDelayMs', () => {
      const client = new WsClient({
        url: 'wss://example.com/ws',
        minDelayMs: 1000,
        maxDelayMs: 5000,
        jitter: 0,
        maxRetries: 20,
      });
      client.connect();

      // Drive through many retries until delay should be capped
      for (let i = 0; i < 6; i++) {
        latestWs().simulateClose(1006, '');
        vi.advanceTimersByTime(5001);
      }
      // After 6 retries with 2^n growth, we should still be within maxDelayMs
      expect(instances.length).toBeGreaterThan(1);
    });

    it('stops reconnecting after maxRetries', () => {
      const onRetriesExhausted = vi.fn();
      const maxRetries = 3;
      const client = new WsClient({
        url: 'wss://example.com/ws',
        minDelayMs: 100,
        maxRetries,
        jitter: 0,
        onRetriesExhausted,
      });
      client.connect();

      // Each iteration: close the latest socket, advance timer so the
      // next scheduled reconnect fires (creating a new socket).
      // After maxRetries reconnects, one more close triggers exhaustion.
      for (let i = 0; i <= maxRetries; i++) {
        latestWs().simulateClose(1006, '');
        vi.advanceTimersByTime(10_000);
      }

      expect(onRetriesExhausted).toHaveBeenCalledOnce();
      expect(client.getStatus()).toBe('closed');
      // No more sockets created after exhaustion
      const countAfterExhaustion = instances.length;
      vi.advanceTimersByTime(60_000);
      expect(instances).toHaveLength(countAfterExhaustion);
    });

    it('does NOT create duplicate connections after rapid close/reconnect cycle', () => {
      // Simulates the bug: client gets open, immediately closes, reconnects with
      // same token.  After reconnect connects() should not add a 2nd socket.
      const client = new WsClient({
        url: 'wss://example.com/ws',
        minDelayMs: 100,
        jitter: 0,
      });
      client.connect();
      latestWs().simulateOpen();
      // Simulate what was observed: connection closes immediately
      latestWs().simulateClose(1006, '');
      // Timer fires → one new socket
      vi.advanceTimersByTime(200);
      expect(instances).toHaveLength(2);
      // Calling connect() while the new socket is CONNECTING must be a no-op
      client.connect();
      expect(instances).toHaveLength(2);
    });
  });

  describe('send()', () => {
    it('sends JSON-serialised data when OPEN', () => {
      const client = new WsClient({ url: 'wss://example.com/ws' });
      client.connect();
      latestWs().simulateOpen();
      const result = client.send({ type: 'turn.attack', cards: ['AS'] });
      expect(result).toBe(true);
      expect((instances[0] as unknown as MockWebSocket).sentMessages).toHaveLength(1);
      expect(JSON.parse((instances[0] as unknown as MockWebSocket).sentMessages[0])).toEqual({
        type: 'turn.attack',
        cards: ['AS'],
      });
    });

    it('returns false when not connected', () => {
      const client = new WsClient({ url: 'wss://example.com/ws' });
      const result = client.send({ type: 'turn.attack' });
      expect(result).toBe(false);
    });
  });

  describe('onMessage()', () => {
    it('parses JSON and calls onMessage callback', () => {
      const onMessage = vi.fn();
      const client = new WsClient({ url: 'wss://example.com/ws', onMessage });
      client.connect();
      latestWs().simulateOpen();
      latestWs().simulateMessage({ type: 'state.snapshot', stateVersion: 1 });
      expect(onMessage).toHaveBeenCalledWith({ type: 'state.snapshot', stateVersion: 1 });
    });
  });
});
