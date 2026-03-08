import type { ClientToServerMessage, ServerToClientMessage } from "@durak/shared";

type WsMessageHandler = (message: ServerToClientMessage) => void;
type WsStatusHandler = (connected: boolean, source?: WsClient, closeCode?: number, closeReason?: string) => void;
type WsErrorHandler = (message: string) => void;

const WS_DIAG = true; // temporary client-side diagnostics for WebSocket

function wsLog(...args: unknown[]) {
  if (WS_DIAG) console.log("[ws]", ...args);
}

export class WsClient {
  private socket: WebSocket | null = null;
  private onMessage: WsMessageHandler;
  private onStatus?: WsStatusHandler;
  private onError?: WsErrorHandler;
  private isManualClose = false;

  constructor(onMessage: WsMessageHandler, onStatus?: WsStatusHandler, onError?: WsErrorHandler) {
    this.onMessage = onMessage;
    this.onStatus = onStatus;
    this.onError = onError;
  }

  /**
   * Connect to the WebSocket. Backend expects auth only via Sec-WebSocket-Protocol.
   * Always pass protocols from createWsClientProtocols(authToken) so the server receives
   * the token (subprotocol "auth.<token>"); otherwise server logs wsAuthSource: "none".
   */
  connect(url: string, protocols: string | string[]) {
    if (this.socket && this.socket.readyState !== WebSocket.CLOSED) {
      wsLog("connect called but socket already exists, state:", this.socket.readyState);
      return;
    }

    const validProtocols = Array.isArray(protocols)
      ? protocols.filter((p) => typeof p === "string" && p.length > 0)
      : typeof protocols === "string" && protocols.length > 0
        ? [protocols]
        : [];
    if (validProtocols.length === 0) {
      console.error("WS connect: protocols required for backend auth (Sec-WebSocket-Protocol)");
      return;
    }

    wsLog("connect called", url.replace(/token=[^&]+/, "token=***"));
    this.isManualClose = false;
    const socket = new WebSocket(url, validProtocols);
    this.socket = socket;

    socket.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (WS_DIAG && data?.type === "connection.ready") wsLog("connection.ready received (onmessage)");
        this.onMessage(data);
      } catch (err) {
        console.error("WS parse error", err);
      }
    };

    socket.onopen = () => {
      wsLog("ws open");
      this.onStatus?.(true);
      if (import.meta.env.DEV) console.log("WS connected");
    };

    socket.onclose = (event) => {
      wsLog("ws close", "code:", event.code, "reason:", event.reason, "clean:", event.wasClean);
      if (this.socket === socket) {
        this.socket = null;
      }
      this.onStatus?.(false, this, event.code, event.reason);
      if (!this.isManualClose) {
        this.onError?.("WebSocket connection closed");
      }
      if (import.meta.env.DEV) console.log("WS disconnected", event.code, event.reason);
      else if (event.code !== 1000) console.warn("WS disconnected", event.code, event.reason);
    };

    socket.onerror = () => {
      wsLog("ws error event");
      this.onError?.("WebSocket connection error");
      if (import.meta.env.DEV) console.error("WS error");
    };
  }

  disconnect() {
    wsLog("disconnect called");
    this.isManualClose = true;
    this.socket?.close();
    this.socket = null;
  }

  send(payload: ClientToServerMessage) {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) return;
    this.socket.send(JSON.stringify(payload));
  }
}
