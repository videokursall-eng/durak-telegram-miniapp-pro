/**
 * Telegram WebApp wrapper.
 *
 * In development (no Telegram context) a mock is returned so the app can run
 * in a normal browser without the Telegram client.
 */

export interface TelegramUser {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
  language_code?: string;
  photo_url?: string;
}

export interface TelegramWebApp {
  ready(): void;
  expand(): void;
  close(): void;
  initData: string;
  initDataUnsafe: {
    user?: TelegramUser;
    query_id?: string;
    auth_date?: number;
    hash?: string;
  };
  colorScheme: 'light' | 'dark';
  themeParams: Record<string, string>;
  isExpanded: boolean;
  viewportHeight: number;
  viewportStableHeight: number;
  MainButton: {
    text: string;
    show(): void;
    hide(): void;
    enable(): void;
    disable(): void;
    onClick(fn: () => void): void;
    offClick(fn: () => void): void;
  };
  BackButton: {
    isVisible: boolean;
    show(): void;
    hide(): void;
    onClick(fn: () => void): void;
    offClick(fn: () => void): void;
  };
  HapticFeedback: {
    impactOccurred(style: 'light' | 'medium' | 'heavy' | 'rigid' | 'soft'): void;
    notificationOccurred(type: 'error' | 'success' | 'warning'): void;
    selectionChanged(): void;
  };
  onEvent(eventType: string, fn: () => void): void;
  offEvent(eventType: string, fn: () => void): void;
}

declare global {
  interface Window {
    Telegram?: { WebApp: TelegramWebApp };
  }
}

// ─── Dev-mode mock ─────────────────────────────────────────────────────────────

const DEV_USER: TelegramUser = {
  id: 123456789,
  first_name: 'Dev',
  last_name: 'Player',
  username: 'devplayer',
  language_code: 'ru',
};

function buildMockInitData(user: TelegramUser): string {
  const params = new URLSearchParams({
    user: JSON.stringify(user),
    auth_date: String(Math.floor(Date.now() / 1000)),
    hash: 'mock_hash_for_development',
    query_id: 'mock_query_id',
  });
  return params.toString();
}

function createMock(): TelegramWebApp {
  const mockInitData = buildMockInitData(DEV_USER);
  return {
    ready: () => console.log('[TG mock] ready()'),
    expand: () => console.log('[TG mock] expand()'),
    close: () => console.log('[TG mock] close()'),
    initData: mockInitData,
    initDataUnsafe: {
      user: DEV_USER,
      auth_date: Math.floor(Date.now() / 1000),
      hash: 'mock_hash_for_development',
      query_id: 'mock_query_id',
    },
    colorScheme: 'dark',
    themeParams: {},
    isExpanded: true,
    viewportHeight: window.innerHeight,
    viewportStableHeight: window.innerHeight,
    MainButton: {
      text: '',
      show: () => {},
      hide: () => {},
      enable: () => {},
      disable: () => {},
      onClick: () => {},
      offClick: () => {},
    },
    BackButton: {
      isVisible: false,
      show: () => {},
      hide: () => {},
      onClick: () => {},
      offClick: () => {},
    },
    HapticFeedback: {
      impactOccurred: () => {},
      notificationOccurred: () => {},
      selectionChanged: () => {},
    },
    onEvent: () => {},
    offEvent: () => {},
  };
}

// ─── Public API ────────────────────────────────────────────────────────────────

const isDev = import.meta.env.DEV;

export const tg: TelegramWebApp =
  window.Telegram?.WebApp ?? (isDev ? createMock() : (() => { throw new Error('Telegram WebApp not available'); })());

/** Returns the raw initData string to send to the server for authentication. */
export function getInitData(): string {
  return tg.initData;
}

/** Returns true when running inside Telegram (not dev mock). */
export function isInTelegram(): boolean {
  return Boolean(window.Telegram?.WebApp);
}

/** Signal that the Mini App is ready to display. */
export function signalReady(): void {
  tg.ready();
  tg.expand();
}
