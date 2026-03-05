export type TgWebApp = {
  ready: () => void;
  expand: () => void;
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