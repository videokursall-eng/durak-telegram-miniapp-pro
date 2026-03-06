/**
 * Состояние игры "Дурак".
 * Типы для игроков, стола и общего состояния партии.
 */

import type { Card, Suit } from "./card";

/** Состояние одного игрока */
export type PlayerState = {
  id: string;
  name: string;
  hand: Card[];
};

/** Пара карт на столе: атака и опциональная защита */
export type TablePair = {
  attack: Card;
  defense?: Card;
};

/** Фаза текущего хода */
export type TurnPhase = "attack" | "defense" | "throw-in" | "cleanup";

/** Полное состояние игры */
export type GameState = {
  players: PlayerState[];
  deck: Card[];
  trumpCard: Card | null;
  trumpSuit: Suit | null;
  tablePairs: TablePair[];
  discard: Card[];
  attackerIndex: number;
  defenderIndex: number;
  currentTurn: TurnPhase;
};
