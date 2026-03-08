import { WS_AUTH_SUBPROTOCOL_PREFIX } from "@durak/shared";

export function createAuthSubprotocols(token: string) {
  return [`${WS_AUTH_SUBPROTOCOL_PREFIX}${token}`];
}

export function extractAuthTokenFromSubprotocolHeader(
  header: string | string[] | undefined
): string | null {
  const raw = Array.isArray(header) ? header.join(",") : header ?? "";
  const values = raw
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);

  const authValue = values.find((value) => value.startsWith(WS_AUTH_SUBPROTOCOL_PREFIX));
  if (!authValue) {
    return null;
  }

  const token = authValue.slice(WS_AUTH_SUBPROTOCOL_PREFIX.length).trim();
  return token || null;
}

/**
 * Extract auth token from WebSocket URL query string.
 * Supports ?token=... and ?auth=... (both allowed as fallback when Sec-WebSocket-Protocol is stripped).
 */
export function extractAuthTokenFromQuery(query: Record<string, string>): string | null {
  const raw = (query.token ?? query.auth ?? "").trim();
  return raw || null;
}

export type WsAuthSource = "protocol" | "query" | "none";

/**
 * Extract auth token for WebSocket: try Sec-WebSocket-Protocol first, then query ?token= or ?auth=.
 * Returns token and source for logging.
 */
export function extractAuthTokenForWs(
  protocolHeader: string | string[] | undefined,
  queryParams: Record<string, string>
): { token: string | null; source: WsAuthSource } {
  const fromProtocol = extractAuthTokenFromSubprotocolHeader(protocolHeader);
  if (fromProtocol) {
    return { token: fromProtocol, source: "protocol" };
  }
  const fromQuery = extractAuthTokenFromQuery(queryParams);
  if (fromQuery) {
    return { token: fromQuery, source: "query" };
  }
  return { token: null, source: "none" };
}
