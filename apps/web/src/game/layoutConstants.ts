/**
 * Константы и хелперы для адаптивного layout игры "Дурак".
 * Используются в App.tsx и TableScene.ts.
 */

/** Ширина экрана, ниже которой применяется mobile layout */
export const MOBILE_BREAKPOINT = 600;

/** Fallback для safe-area-inset-bottom (типичное значение на iPhone) */
export const SAFE_AREA_BOTTOM_FALLBACK = 24;

/** Высота action bar (2x2 сетка). Синхронизировано с App ACTION_BAR_HEIGHT. */
export const ACTION_BAR_HEIGHT = 120;

/** Отступ action bar от нижнего края (с учётом safe-area) */
export const ACTION_BAR_OFFSET = 44;

/** Высота action bar на desktop (1 ряд кнопок) */
export const ACTION_BAR_HEIGHT_DESKTOP = 72;

/**
 * Зарезервированная высота под action bar + safe area.
 * Phaser-сцена использует это для reservedBottom.
 */
export const ACTION_BAR_RESERVED_HEIGHT_DESKTOP =
  ACTION_BAR_HEIGHT_DESKTOP + 8;

/** Резерв под action bar на mobile (уменьшен для растягивания стола вниз) */
export const ACTION_BAR_RESERVED_HEIGHT_MOBILE = 60;

/**
 * Проверяет, нужен ли mobile layout.
 */
export function isMobileLayout(width: number): boolean {
  return width < MOBILE_BREAKPOINT;
}

/**
 * Возвращает зарезервированную высоту под action bar в зависимости от ширины.
 */
export function getActionBarReservedHeight(width: number): number {
  return isMobileLayout(width)
    ? ACTION_BAR_RESERVED_HEIGHT_MOBILE
    : ACTION_BAR_RESERVED_HEIGHT_DESKTOP;
}
