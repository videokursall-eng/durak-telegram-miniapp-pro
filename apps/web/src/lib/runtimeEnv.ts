function normalizeAppEnv(value: string | undefined) {
  const normalized = value?.trim().toLowerCase();
  return normalized && normalized.length > 0 ? normalized : null;
}

export function getClientAppEnv() {
  return (
    normalizeAppEnv(import.meta.env.VITE_APP_ENV) ??
    normalizeAppEnv(import.meta.env.VITE_APP_MODE) ??
    (import.meta.env.DEV ? "development" : "production")
  );
}

export function isDevelopmentAppEnv() {
  return getClientAppEnv() === "development";
}

/**
 * Local dev auth: only true when running in Vite dev mode AND app env is "development"
 * AND VITE_TELEGRAM_ONLY is not "1". Production builds have import.meta.env.DEV false.
 */
export function isLocalDevAuthEnabled() {
  if (import.meta.env.VITE_TELEGRAM_ONLY === "1") {
    return false;
  }
  return import.meta.env.DEV && isDevelopmentAppEnv();
}
