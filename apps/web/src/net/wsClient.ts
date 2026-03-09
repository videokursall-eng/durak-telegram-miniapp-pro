/**
 * WebSocket client with automatic reconnection and exponential back-off.
 *
 * ## Reconnection strategy
 *
 * | Attempt | Delay (before jitter) |
 * |---------|-----------------------|
 * |  1      |  1 s                  |
 * |  2      |  2 s                  |
 * |  3      |  4 s                  |
 * |  4      |  8 s                  |
 * |  5      | 16 s                  |
 * |  6+     | 30 s  (cap)           |
 *
 * A ±20 % random jitter is added to avoid thundering-herd when many
 * clients reconnect simultaneously after a server restart.
 *
 * The client will NOT reconnect if:
 *  - `close()` was called explicitly (deliberate disconnect), OR
 *  - the maximum number of retries has been reached.
 *
 * ## Single-connection guarantee
 *
 * Only one WebSocket connection is ever open at a time.  If `connect()`
 * is called while a socket is already OPEN or CONNECTING the call is
 * ignored – no new connection is created.  This prevents the
 * "reconnection storm" pattern (multiple concurrent sockets for the
 * same token) observed in production logs.
 */

export type WsClientOptions = {
  /** Full WebSocket URL, e.g. "wss://app.example.com/ws?token=…" */
  url: string;

  /**
   * Minimum delay in ms before the first reconnection attempt.
   * @default 1000
   */
  minDelayMs?: number;

  /**
   * Maximum delay in ms between reconnection attempts.
   * @default 30_000
   */
  maxDelayMs?: number;

  /**
   * Fraction of the base delay to add as random jitter (0–1).
   * @default 0.2
   */
  jitter?: number;

  /**
   * Maximum number of reconnection attempts before giving up.
   * Set to `Infinity` to retry forever.
   * @default 10
   */
  maxRetries?: number;

  /** Called when the connection is open and ready. */
  onOpen?: () => void;

  /** Called when a message arrives. */
  onMessage?: (data: unknown) => void;

  /** Called when the connection closes (intentionally or not). */
  onClose?: (code: number, reason: string) => void;

  /**
   * Called when all retry attempts have been exhausted.
   * The client stops reconnecting after this.
   */
  onRetriesExhausted?: () => void;
};

export type WsClientStatus = 'idle' | 'connecting' | 'open' | 'reconnecting' | 'closed';

export class WsClient {
  private ws: WebSocket | null = null;
  private status: WsClientStatus = 'idle';
  private retryCount = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  /** When true, no automatic reconnect will happen (explicit close). */
  private intentionallyClosed = false;

  private readonly opts: Required<WsClientOptions>;

  constructor(opts: WsClientOptions) {
    this.opts = {
      minDelayMs: 1_000,
      maxDelayMs: 30_000,
      jitter: 0.2,
      maxRetries: 10,
      onOpen: () => undefined,
      onMessage: () => undefined,
      onClose: () => undefined,
      onRetriesExhausted: () => undefined,
      ...opts,
    };
  }

  /** Current connection status. */
  getStatus(): WsClientStatus {
    return this.status;
  }

  /**
   * Open the WebSocket connection.
   *
   * Safe to call multiple times – if the socket is already OPEN or
   * CONNECTING, the call is a no-op (prevents duplicate connections).
   */
  connect(): void {
    if (
      this.ws !== null &&
      (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)
    ) {
      // Already open or in progress – do not create a duplicate connection.
      return;
    }

    this.intentionallyClosed = false;
    this._open();
  }

  /**
   * Close the connection and stop reconnecting.
   * After calling this, `connect()` must be called again to reconnect.
   */
  close(code = 1000, reason = 'client closed'): void {
    this.intentionallyClosed = true;
    this._cancelReconnect();
    if (this.ws) {
      try {
        this.ws.close(code, reason);
      } catch {
        // ignore
      }
      this.ws = null;
    }
    this.status = 'closed';
    this.retryCount = 0;
  }

  /** Send a JSON-serialisable message. Returns false if not connected. */
  send(data: unknown): boolean {
    if (this.ws?.readyState !== WebSocket.OPEN) return false;
    this.ws.send(JSON.stringify(data));
    return true;
  }

  // ─── private ────────────────────────────────────────────────────────────────

  private _open(): void {
    this.status = this.retryCount === 0 ? 'connecting' : 'reconnecting';
    const ws = new WebSocket(this.opts.url);
    this.ws = ws;

    ws.onopen = () => {
      this.status = 'open';
      this.retryCount = 0;
      this.opts.onOpen();
    };

    ws.onmessage = (event: MessageEvent<string>) => {
      let parsed: unknown;
      try {
        parsed = JSON.parse(event.data);
      } catch {
        parsed = event.data;
      }
      this.opts.onMessage(parsed);
    };

    ws.onclose = (event: CloseEvent) => {
      this.opts.onClose(event.code, event.reason);

      // Do not reconnect on intentional close or on auth failure (4001).
      if (this.intentionallyClosed || event.code === 4001) {
        this.status = 'closed';
        return;
      }

      this._scheduleReconnect();
    };

    ws.onerror = () => {
      // The 'close' event always fires after 'error', so reconnect logic
      // lives in onclose to avoid double-scheduling.
    };
  }

  private _scheduleReconnect(): void {
    if (this.intentionallyClosed) return;

    if (this.retryCount >= this.opts.maxRetries) {
      this.status = 'closed';
      this.opts.onRetriesExhausted();
      return;
    }

    const delay = this._backoffDelay(this.retryCount);
    this.retryCount++;
    this.status = 'reconnecting';

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (!this.intentionallyClosed) {
        this._open();
      }
    }, delay);
  }

  private _cancelReconnect(): void {
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  /**
   * Compute the back-off delay for a given retry attempt.
   *
   * Formula: `min(minDelay * 2^attempt, maxDelay) ± jitter`, with the
   * result clamped to at least `minDelay` after jitter is applied.
   */
  private _backoffDelay(attempt: number): number {
    const base = Math.min(
      this.opts.maxDelayMs,
      this.opts.minDelayMs * Math.pow(2, attempt),
    );
    const jitterRange = base * this.opts.jitter;
    // random in [-jitterRange, +jitterRange]
    const jitter = (Math.random() * 2 - 1) * jitterRange;
    return Math.max(this.opts.minDelayMs, Math.round(base + jitter));
  }
}
