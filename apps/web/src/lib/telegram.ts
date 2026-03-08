export type TgWebApp = {
  ready: () => void;
  expand: () => void;
  initData?: string;
  initDataUnsafe?: {
    start_param?: string;
    user?: {
      id?: number;
      username?: string;
      first_name?: string;
      last_name?: string;
    };
  };
  setHeaderColor?: (color: string) => void;
  setBackgroundColor?: (color: string) => void;
  disableClosingConfirmation?: () => void;
  enableClosingConfirmation?: () => void;
  viewportHeight?: number;
  viewportStableHeight?: number;
  isExpanded?: boolean;
  colorScheme?: "light" | "dark";
  themeParams?: Record<string, unknown>;
};

export function getTg(): TgWebApp | null {
  const w = window as any;
  return w?.Telegram?.WebApp ?? null;
}

export function getTelegramInitData(): string | null {
  const tg = getTg();
  const value = tg?.initData?.trim();
  return value ? value : null;
}

export function getTelegramDisplayName(): string | null {
  const user = getTg()?.initDataUnsafe?.user;
  if (!user) {
    return null;
  }

  const fullName = [user.first_name, user.last_name].filter(Boolean).join(" ").trim();
  return fullName || user.username || null;
}

export function getTelegramStartParam(): string | null {
  const value = getTg()?.initDataUnsafe?.start_param?.trim();
  return value ? value : null;
}

export function isTelegramMiniApp() {
  return Boolean(getTg()?.initData);
}

export function getConfiguredTelegramMiniAppUrl(): string | null {
  const value = import.meta.env.VITE_TELEGRAM_MINI_APP_URL?.trim();
  return value ? value : null;
}

/**
 * URL Mini App для подстановки в BotFather (Menu Button / Web App).
 * Должен быть реальный HTTPS; тот же URL задаётся в VITE_TELEGRAM_MINI_APP_URL при сборке.
 */
export function getMiniAppLaunchUrl(): string | null {
  return getConfiguredTelegramMiniAppUrl();
}

/**
 * Ссылка для открытия бота в Telegram (t.me/BotUsername или t.me/BotUsername?startapp=ShortName).
 * Если задан short name, возвращает ссылку с startapp (открывает Mini App сразу).
 */
export function getTelegramBotAppLink(): string | null {
  const username = getConfiguredTelegramBotUsername();
  if (!username) return null;
  const base = `https://t.me/${username}`;
  const shortName = getConfiguredTelegramMiniAppShortName();
  if (shortName) {
    return `${base}?startapp=${encodeURIComponent(shortName)}`;
  }
  return base;
}

export function getConfiguredTelegramBotUsername(): string | null {
  const value = import.meta.env.VITE_TELEGRAM_BOT_USERNAME?.trim();
  return value ? value.replace(/^@/, "") : null;
}

export function getConfiguredTelegramMiniAppShortName(): string | null {
  const value = import.meta.env.VITE_TELEGRAM_MINI_APP_SHORT_NAME?.trim();
  return value ? value : null;
}