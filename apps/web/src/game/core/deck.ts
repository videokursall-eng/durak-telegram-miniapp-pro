/**
 * Колода карт: создание, перемешивание, взятие карт.
 * Все операции не мутируют входные массивы.
 */

import type { Card, Suit } from "./card";
import { RANKS_BY_ORDER } from "./card";

/** Функция генерации случайного числа [0, 1) для перемешивания */
export type Rng = () => number;

/** Масти в стандартном порядке */
const SUITS: readonly Suit[] = ["♠", "♥", "♦", "♣"] as const;

let cardIdCounter = 0;

/** Генерирует уникальный id для карты */
function nextCardId(): string {
  return `card-${++cardIdCounter}`;
}

/**
 * Создаёт 36-карточную колоду (от 6 до туза, 4 масти).
 */
export function createDeck36(): Card[] {
  const deck: Card[] = [];
  for (const suit of SUITS) {
    for (const rank of RANKS_BY_ORDER) {
      deck.push({
        id: nextCardId(),
        suit,
        rank,
      });
    }
  }
  return deck;
}

/**
 * Перемешивает колоду. Возвращает новый массив, исходный не изменяется.
 * @param rng — опциональная функция случайности (по умолчанию Math.random)
 */
export function shuffleDeck(cards: Card[], rng: Rng = Math.random): Card[] {
  const result = [...cards];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

/**
 * Берёт верхнюю карту из колоды. Возвращает карту и новую колоду без этой карты.
 * Исходная колода не изменяется.
 */
export function drawCard(deck: Card[]): { card: Card | null; deck: Card[] } {
  if (deck.length === 0) {
    return { card: null, deck: [] };
  }
  const [card, ...rest] = deck;
  return { card, deck: rest };
}

/**
 * Возвращает нижнюю карту колоды (козырь), не удаляя её.
 * В 36-карточной колоде козырь — последняя карта после раздачи.
 */
export function peekTrump(deck: Card[]): Card | null {
  if (deck.length === 0) return null;
  return deck[deck.length - 1] ?? null;
}
