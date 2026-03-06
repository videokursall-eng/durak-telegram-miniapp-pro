/**
 * Адаптивный layout игрового стола.
 * Отдельные метрики для mobile и desktop.
 */

import {
  isMobileLayout,
  getActionBarReservedHeight,
} from "./layoutConstants";

export type TableMetrics = {
  pad: number;
  sideW: number;
  sideX: number;
  reservedBottom: number;
  centerW: number;
  centerH: number;
  centerX: number;
  centerY: number;
  playW: number;
  playH: number;
  /** Зоны атаки/защиты: horizontal (рядом) или vertical (стопкой) */
  zoneLayout: "horizontal" | "vertical";
  attackZone: { x: number; y: number; w: number; h: number };
  defenseZone: { x: number; y: number; w: number; h: number };
  /** Стиль подписей зон */
  labelStyle: { fontSize: string; offsetFromTop: number };
};

export type ZoneLabelStyle = {
  fontSize: string;
  offsetFromTop: number;
};

/**
 * Возвращает зарезервированную высоту под action bar.
 */
export function getActionBarReservedHeightForTable(width: number): number {
  return getActionBarReservedHeight(width);
}

/**
 * Проверяет mobile layout.
 */
export function isMobileTableLayout(width: number): boolean {
  return isMobileLayout(width);
}

/**
 * Стиль подписей "АТАКА" / "ЗАЩИТА" в зависимости от layout.
 */
export function getZoneLabelStyle(width: number): ZoneLabelStyle {
  if (isMobileLayout(width)) {
    return { fontSize: "14px", offsetFromTop: 12 };
  }
  return { fontSize: "18px", offsetFromTop: 8 };
}

/**
 * Вычисляет метрики layout стола.
 */
export function getTableMetrics(
  width: number,
  height: number,
  _playerCount: number
): TableMetrics {
  const mobile = isMobileLayout(width);
  const reservedBottom = getActionBarReservedHeight(width);

  const horizontalPadding = mobile ? 8 : 12;

  const pad = mobile ? horizontalPadding : Math.max(12, Math.floor(Math.min(width, height) * 0.03));

  const sideW = mobile
    ? Math.max(42, Math.floor(width * 0.07))
    : Math.max(110, Math.floor(width * 0.17));
  const sideX = width - pad - sideW / 2;

  const centerW = width - sideW - pad * 3;
  const centerH = height - pad * 2 - reservedBottom;
  const centerX = pad + centerW / 2;
  const centerY = pad + centerH / 2;

  const playW = mobile ? width - pad * 2 - sideW : centerW * 0.78;
  const playH = mobile ? centerH * 0.68 : centerH * 0.52;

  const labelStyle = getZoneLabelStyle(width);

  if (mobile) {
    const zoneFullW = playW;
    const zoneHalfH = Math.floor(playH * 0.48);
    const gap = Math.floor(playH * 0.04);
    const effectiveCenterW = playW;

    return {
      pad,
      sideW,
      sideX,
      reservedBottom,
      centerW: effectiveCenterW,
      centerH,
      centerX: pad + playW / 2,
      centerY,
      playW,
      playH,
      zoneLayout: "vertical",
      attackZone: {
        x: centerX,
        y: centerY - gap / 2 - zoneHalfH / 2,
        w: zoneFullW,
        h: zoneHalfH,
      },
      defenseZone: {
        x: centerX,
        y: centerY + gap / 2 + zoneHalfH / 2,
        w: zoneFullW,
        h: zoneHalfH,
      },
      labelStyle,
    };
  }

  const halfW = Math.floor(playW * 0.48);
  const zoneH = Math.floor(playH * 0.86);
  const gap = Math.floor(playW * 0.08);

  return {
    pad,
    sideW,
    sideX,
    reservedBottom,
    centerW,
    centerH,
    centerX,
    centerY,
    playW,
    playH,
    zoneLayout: "horizontal",
    attackZone: {
      x: centerX - gap / 2 - halfW / 2,
      y: centerY,
      w: halfW,
      h: zoneH,
    },
    defenseZone: {
      x: centerX + gap / 2 + halfW / 2,
      y: centerY,
      w: halfW,
      h: zoneH,
    },
    labelStyle,
  };
}
