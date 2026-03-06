/**
 * Начальная настройка игры "Дурак".
 * Создание колоды, определение козыря, раздача карт.
 */

import type { Card } from "./card";
import type { GameState } from "./state";
import {
  createDeck36,
  shuffleDeck,
  drawCard,
  peekTrump,
} from "./deck";
import type { Suit } from "./card";

const MIN_PLAYERS = 2;
const MAX_PLAYERS = 6;
const CARDS_PER_PLAYER = 6;

/**
 * Создаёт начальное состояние игры.
 * @param playerCount — количество игроков (2–6)
 * @throws Error если playerCount вне допустимого диапазона
 */
export function createInitialGame(playerCount: number): GameState {
  if (playerCount < MIN_PLAYERS || playerCount > MAX_PLAYERS) {
    throw new Error(
      `playerCount must be between ${MIN_PLAYERS} and ${MAX_PLAYERS}, got ${playerCount}`
    );
  }

  let deck = createDeck36();
  deck = shuffleDeck(deck);

  // Козырь — нижняя карта колоды (остаётся в колоде до первого добора)
  const trumpCard = peekTrump(deck);
  const trumpSuit: Suit | null = trumpCard ? trumpCard.suit : null;

  // Раздаём по 6 карт каждому игроку
  const players: Array<{ id: string; name: string; hand: Card[] }> = [];

  for (let i = 0; i < playerCount; i++) {
    players.push({
      id: `player-${i}`,
      name: `Игрок ${i + 1}`,
      hand: [],
    });
  }

  for (let round = 0; round < CARDS_PER_PLAYER; round++) {
    for (let p = 0; p < playerCount; p++) {
      const { card, deck: newDeck } = drawCard(deck);
      deck = newDeck;
      if (card) {
        players[p].hand.push(card);
      }
    }
  }

  return {
    players,
    deck,
    trumpCard,
    trumpSuit,
    tablePairs: [],
    discard: [],
    attackerIndex: 0,
    defenderIndex: 1,
    currentTurn: "attack",
  };
}
