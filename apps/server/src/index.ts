import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({
  path: path.resolve(__dirname, "../.env"),
});

// Crash protection: do not let unhandled errors take down the process silently.
// ECONNRESET is common when cloudflared/tunnel or client closes the TCP connection; do not exit.
process.on("uncaughtException", (err) => {
  const code = err && typeof err === "object" && "code" in err ? (err as NodeJS.ErrnoException).code : undefined;
  if (code === "ECONNRESET" || code === "EPIPE" || code === "ECONNREFUSED") {
    console.warn("[uncaughtException]", code, err?.message ?? err);
    return;
  }
  console.error("[uncaughtException]", err?.message ?? err);
  if (err && typeof err === "object" && "stack" in err) {
    console.error((err as Error).stack);
  }
  setTimeout(() => process.exit(1), 1000);
});

process.on("unhandledRejection", (reason, promise) => {
  console.error("[unhandledRejection]", reason);
  // Log but do not exit; allow the app to keep running.
});

import { buildApp } from "./app";
import { readAppConfig } from "./config";

const config = readAppConfig();

if (!config.telegramBotToken && !config.allowDevAuth) {
  throw new Error("TELEGRAM_BOT_TOKEN is required");
}

// Frontend build for single-origin: apps/web/dist (override with STATIC_ROOT)
const staticRoot =
  process.env.STATIC_ROOT?.trim() ||
  path.resolve(__dirname, "..", "..", "web", "dist");

const app = await buildApp({
  telegramBotToken: config.telegramBotToken,
  authTokenTtlSeconds: config.authTokenTtlSeconds,
  telegramInitDataTtlSeconds: config.telegramInitDataTtlSeconds,
  trustProxy: config.trustProxy,
  appEnv: config.appEnv,
  deployPlatform: config.deployPlatform,
  allowDevAuth: config.allowDevAuth,
  corsAllowedOrigins: config.corsAllowedOrigins,
  staticRoot,
});

const address = await app.listen({
  port: config.port,
  host: config.host,
});

console.log(`Server listening at ${address}`);