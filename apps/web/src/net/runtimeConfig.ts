function trimTrailingSlash(value: string) {
  return value.replace(/\/+$/, "");
}

const DEFAULT_LOCAL_DEV_API_BASE_URL = "http://127.0.0.1:8080";
const WS_PATH = "/ws";

let devEndpointsLogged = false;

function logDevEndpointsOnce() {
  if (!import.meta.env.DEV || devEndpointsLogged) {
    return;
  }
  devEndpointsLogged = true;
  console.info("[dev] API base URL:", getApiBaseUrl(), "| WS URL:", getWebSocketUrl());
}

function getWindowOrigin() {
  return window.location.origin;
}

function getWindowWsOrigin() {
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${window.location.host}`;
}

function getConfiguredLocalDevApiBaseUrl() {
  return trimTrailingSlash(import.meta.env.VITE_API_BASE_URL?.trim() || DEFAULT_LOCAL_DEV_API_BASE_URL);
}

function getConfiguredLocalDevWsBaseUrl() {
  const explicit = import.meta.env.VITE_WS_BASE_URL?.trim();
  if (explicit) {
    return trimTrailingSlash(explicit);
  }

  return trimTrailingSlash(
    getConfiguredLocalDevApiBaseUrl().replace(/^http:/, "ws:").replace(/^https:/, "wss:")
  );
}

export function getApiBaseUrl() {
  logDevEndpointsOnce();
  if (import.meta.env.DEV) {
    return getConfiguredLocalDevApiBaseUrl();
  }
  // Single-origin: production always uses current origin (no VITE_SERVER_ORIGIN / VITE_API_BASE_URL).
  return trimTrailingSlash(getWindowOrigin());
}

export function getWebSocketUrl(authToken?: string | null) {
  logDevEndpointsOnce();
  let base: string;
  if (import.meta.env.DEV) {
    base = `${getConfiguredLocalDevWsBaseUrl()}${WS_PATH}`;
  } else {
    // Single-origin: production always uses current origin (wss://same-host/ws).
    base = `${trimTrailingSlash(getWindowWsOrigin())}${WS_PATH}`;
  }
  // Add token in query as fallback when Sec-WebSocket-Protocol is stripped (e.g. Telegram WebView / Cloudflare).
  if (authToken) {
    const separator = base.includes("?") ? "&" : "?";
    return `${base}${separator}token=${encodeURIComponent(authToken)}`;
  }
  return base;
}
