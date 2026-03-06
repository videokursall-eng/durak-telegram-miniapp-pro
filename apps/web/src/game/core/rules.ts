/**
 * Правила игры "Дурак".
 * Проверка допустимости атаки, защиты и подкидывания.
 */

import type { GameState } from "./state";
import type { Card, Rank, Suit } from "./card";
import { getRankValue, isTrump } from "./card";

/**
 * Возвращает ранги карт, которые уже лежат на столе (атака или защита).
 * Используется для проверки, можно ли атаковать/подкидывать картой данного ранга.
 */
export function getTableRanks(state: GameState): Rank[] {
  const ranks: Rank[] = [];
  for (const pair of state.tablePairs) {
    ranks.push(pair.attack.rank);
    if (pair.defense) {
      ranks.push(pair.defense.rank);
    }
  }
  return ranks;
}

/**
 * Находит индекс первой небитой пары на столе.
 * @returns индекс пары без defense или -1, если все пары биты
 */
export function findFirstUncoveredPair(state: GameState): number {
  return state.tablePairs.findIndex((pair) => pair.defense === undefined);
}

/**
 * Проверяет, можно ли атаковать данной картой.
 * MVP-правила:
 * - если на столе нет карт — можно атаковать любой картой;
 * - если на столе есть карты — только картой того ранга, который уже есть на столе.
 */
export function canAttackWithCard(state: GameState, card: Card): boolean {
  const tableRanks = getTableRanks(state);
  if (tableRanks.length === 0) {
    return true;
  }
  return tableRanks.includes(card.rank);
}

/**
 * Проверяет, можно ли отбить атакующую карту данной картой защиты.
 * Правила:
 * - карта той же масти и старше — бьёт;
 * - любой козырь бьёт некозырную карту;
 * - более старший козырь бьёт младший козырь.
 */
export function canDefendWithCard(
  attackCard: Card,
  defenseCard: Card,
  trumpSuit: Suit | null
): boolean {
  if (!trumpSuit) {
    // Без козыря: только той же масти и старше
    if (defenseCard.suit !== attackCard.suit) return false;
    return getRankValue(defenseCard.rank) > getRankValue(attackCard.rank);
  }

  const attackIsTrump = isTrump(attackCard, trumpSuit);
  const defenseIsTrump = isTrump(defenseCard, trumpSuit);

  if (defenseIsTrump && !attackIsTrump) {
    return true; // козырь бьёт некозырную
  }
  if (!defenseIsTrump && attackIsTrump) {
    return false; // некозырь не бьёт козырь
  }
  if (defenseIsTrump && attackIsTrump) {
    return getRankValue(defenseCard.rank) > getRankValue(attackCard.rank);
  }
  // обе некозырные
  if (defenseCard.suit !== attackCard.suit) return false;
  return getRankValue(defenseCard.rank) > getRankValue(attackCard.rank);
}

/**
 * Проверяет, можно ли подкинуть данную карту (в режиме throw-in).
 * Подкидывать можно только картой того ранга, который уже есть на столе.
 */
export function canThrowInWithCard(state: GameState, card: Card): boolean {
  const tableRanks = getTableRanks(state);
  return tableRanks.includes(card.rank);
}
