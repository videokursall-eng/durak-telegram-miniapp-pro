type AppConfig = {
  host: string;
  port: number;
  telegramBotToken: string | null;
  authTokenTtlSeconds: number;
  telegramInitDataTtlSeconds: number;
  trustProxy: boolean;
  appEnv: string;
  deployPlatform: string | null;
  allowDevAuth: boolean;
  corsAllowedOrigins: string[];
  publicBaseUrl: string | null;
  publicWebAppUrl: string | null;
};

function readStringEnv<T extends string | null>(name: string, fallback: T): string | T;
function readStringEnv(name: string, fallback?: string): string | undefined;
function readStringEnv(name: string, fallback?: string | null) {
  const value = process.env[name]?.trim();
  return value && value.length > 0 ? value : fallback;
}

function readNumberEnv(name: string, fallback: number) {
  const raw = process.env[name]?.trim();
  if (!raw) {
    return fallback;
  }

  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) {
    throw new Error(`${name} must be a valid number`);
  }

  return parsed;
}

function readBooleanEnv(name: string, fallback: boolean) {
  const raw = process.env[name]?.trim().toLowerCase();
  if (!raw) {
    return fallback;
  }

  return raw === "1" || raw === "true" || raw === "yes" || raw === "on";
}

function readListEnv(name: string, fallback: string[]) {
  const raw = process.env[name]?.trim();
  if (!raw) {
    return fallback;
  }

  return raw
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}

export function readAppConfig(): AppConfig {
  const appEnv = readStringEnv("APP_ENV", process.env.NODE_ENV ?? "development")!;
  const isProduction = appEnv === "production";
  // Dev auth (POST /auth/dev) is only enabled when APP_ENV=development. Production auth is Telegram only.
  const allowDevAuthDefault = appEnv === "development";

  const defaultCors = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
  ];
  const publicWebAppUrl = readStringEnv("PUBLIC_WEB_APP_URL", null as string | null) ?? null;
  const corsOrigins = readListEnv("CORS_ALLOWED_ORIGINS", defaultCors);
  const corsWithPublic =
    publicWebAppUrl && !corsOrigins.some((o) => o === publicWebAppUrl)
      ? [...corsOrigins, publicWebAppUrl]
      : corsOrigins;

  // In production, dev auth must never be enabled (ignore ALLOW_DEV_AUTH).
  const allowDevAuth =
    isProduction ? false : readBooleanEnv("ALLOW_DEV_AUTH", allowDevAuthDefault);

  return {
    // On VPS behind nginx, bind to 127.0.0.1 so only nginx can reach the app.
  host: readStringEnv("HOST", isProduction ? "127.0.0.1" : "127.0.0.1")!,
    port: readNumberEnv("PORT", 8080),
    telegramBotToken: readStringEnv("TELEGRAM_BOT_TOKEN", null as string | null) ?? null,
    authTokenTtlSeconds: readNumberEnv("AUTH_TOKEN_TTL_SECONDS", 60 * 60 * 24),
    telegramInitDataTtlSeconds: readNumberEnv("TELEGRAM_INITDATA_TTL_SECONDS", 60 * 60),
    trustProxy: readBooleanEnv("TRUST_PROXY", isProduction),
    appEnv,
    deployPlatform: readStringEnv("DEPLOY_PLATFORM", null as string | null) ?? null,
    allowDevAuth,
    corsAllowedOrigins: corsWithPublic,
    publicBaseUrl: readStringEnv("PUBLIC_BASE_URL", null as string | null) ?? null,
    publicWebAppUrl,
  };
}

export type { AppConfig };
