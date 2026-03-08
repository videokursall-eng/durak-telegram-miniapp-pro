/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** development | production — controls dev auth and build behavior */
  readonly VITE_APP_ENV?: string;
  /** Alias for VITE_APP_ENV */
  readonly VITE_APP_MODE?: string;
  readonly VITE_ISOLATED_DEV_MODE?: string;
  /** Backend API base URL (e.g. https://api.example.com) */
  readonly VITE_API_BASE_URL?: string;
  /** Backend origin; used when VITE_API_BASE_URL / VITE_WS_URL not set */
  readonly VITE_SERVER_ORIGIN?: string;
  /** WebSocket base URL (e.g. wss://api.example.com); /ws appended if needed */
  readonly VITE_WS_BASE_URL?: string;
  /** Full WebSocket URL (overrides base) */
  readonly VITE_WS_URL?: string;
  /** Mini App public URL (HTTPS); must match BotFather. Never localhost for Telegram. */
  readonly VITE_TELEGRAM_MINI_APP_URL?: string;
  readonly VITE_TELEGRAM_BOT_USERNAME?: string;
  readonly VITE_TELEGRAM_MINI_APP_SHORT_NAME?: string;
  /** 1 = require Telegram (no dev auth) */
  readonly VITE_TELEGRAM_ONLY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
