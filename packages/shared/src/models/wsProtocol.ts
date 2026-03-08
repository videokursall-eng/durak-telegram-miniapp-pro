/**
 * WebSocket auth contract (shared by server and client).
 *
 * Primary: Sec-WebSocket-Protocol with a single subprotocol:
 *
 *    auth.<token>
 *
 * Fallback (when protocol header is stripped, e.g. Telegram WebView / Cloudflare):
 * backend also accepts token from URL query: ?token=...
 *
 * Client should send both: protocols = [auth.<token>] and URL with ?token=...
 */

export const WS_AUTH_SUBPROTOCOL_PREFIX = "auth.";

/**
 * Build protocols array for the WebSocket constructor.
 *
 * The browser will send:
 *
 *    Sec-WebSocket-Protocol: auth.<token>
 *
 * The backend extracts the token by checking for the prefix "auth.".
 */
export function createWsClientProtocols(authToken: string): string[] {
  return [`${WS_AUTH_SUBPROTOCOL_PREFIX}${authToken}`];
}
