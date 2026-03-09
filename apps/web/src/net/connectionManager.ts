import { WsClient } from './wsClient.js';
import { authTelegram } from './apiClient.js';

export type ConnectionState =
  | { status: 'idle' }
  | { status: 'authenticating' }
  | { status: 'connecting' }
  | { status: 'open'; connectionId: string }
  | { status: 'reconnecting'; attempt: number }
  | { status: 'error'; reason: string };

type Listener = (state: ConnectionState) => void;

const WS_BASE_URL = (import.meta as Record<string, unknown>)['env'] !== undefined
  ? ((import.meta as { env: Record<string, string> }).env['VITE_WS_URL'] ?? '').replace(/\/$/, '')
  : '';

/**
 * High-level connection manager that handles the full auth→WS flow.
 *
 * Usage:
 *   const mgr = new ConnectionManager(initData, onMessage);
 *   mgr.onStateChange(setState);
 *   await mgr.start();
 */
export class ConnectionManager {
  private client: WsClient | null = null;
  private token: string | null = null;
  private state: ConnectionState = { status: 'idle' };
  private retryAttempt = 0;
  private readonly listeners: Listener[] = [];
  private stopped = false;

  constructor(
    private readonly getInitData: () => string,
    private readonly onMessage: (msg: unknown) => void,
  ) {}

  onStateChange(fn: Listener): () => void {
    this.listeners.push(fn);
    return () => {
      const idx = this.listeners.indexOf(fn);
      if (idx >= 0) this.listeners.splice(idx, 1);
    };
  }

  async start(): Promise<void> {
    if (this.stopped) return;
    await this._authenticate();
  }

  stop(): void {
    this.stopped = true;
    this.client?.close();
    this.client = null;
  }

  send(data: unknown): boolean {
    return this.client?.send(data) ?? false;
  }

  // ─── private ─────────────────────────────────────────────────────────────

  private async _authenticate(): Promise<void> {
    if (this.stopped) return;
    this._setState({ status: 'authenticating' });
    try {
      const { token } = await authTelegram(this.getInitData());
      this.token = token;
      this._connect();
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      this._setState({ status: 'error', reason });
    }
  }

  private _connect(): void {
    if (this.stopped || !this.token) return;

    const url = `${WS_BASE_URL}/ws?token=${encodeURIComponent(this.token)}`;
    this._setState({ status: 'connecting' });

    // Destroy any previous client before creating a new one.
    // This ensures we never have two concurrent WebSocket connections.
    this.client?.close();

    this.client = new WsClient({
      url,
      onOpen: () => {
        this.retryAttempt = 0;
      },
      onMessage: (msg) => {
        if (
          msg !== null &&
          typeof msg === 'object' &&
          (msg as Record<string, unknown>)['type'] === 'connection.ready'
        ) {
          const connectionId = String(
            (msg as Record<string, unknown>)['connectionId'] ?? '',
          );
          this._setState({ status: 'open', connectionId });
        }
        this.onMessage(msg);
      },
      onClose: (_code, _reason) => {
        if (!this.stopped) {
          this.retryAttempt++;
          this._setState({ status: 'reconnecting', attempt: this.retryAttempt });
        }
      },
      onRetriesExhausted: () => {
        this._setState({ status: 'error', reason: 'Connection lost. Please reload.' });
      },
    });

    this.client.connect();
  }

  private _setState(next: ConnectionState): void {
    this.state = next;
    for (const fn of this.listeners) {
      try {
        fn(next);
      } catch {
        // ignore listener errors
      }
    }
  }
}
