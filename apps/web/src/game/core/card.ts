/**
 * Карта и связанные типы для игры "Дурак".
 * Без привязки к UI/Phaser.
 */

/** Масти карт */
export type Suit = "♠" | "♥" | "♦" | "♣";

/** Ранги карт (от 6 до туза) */
export type Rank = "6" | "7" | "8" | "9" | "10" | "J" | "Q" | "K" | "A";

/** Карта с уникальным id */
export type Card = {
  id: string;
  suit: Suit;
  rank: Rank;
};

/** Ранги по порядку старшинства (от младшего к старшему) */
export const RANKS_BY_ORDER: readonly Rank[] = [
  "6",
  "7",
  "8",
  "9",
  "10",
  "J",
  "Q",
  "K",
  "A",
] as const;

/**
 * Возвращает числовое значение ранга (6=0, 7=1, ..., A=8).
 * Используется для сравнения карт.
 */
export function getRankValue(rank: Rank): number {
  return RANKS_BY_ORDER.indexOf(rank);
}

/**
 * Проверяет, является ли карта козырем.
 */
export function isTrump(card: Card, trumpSuit: Suit): boolean {
  return card.suit === trumpSuit;
}
