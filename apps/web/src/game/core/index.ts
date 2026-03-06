/**
 * Core-логика игры "Дурак".
 * Без привязки к Phaser и React.
 */

// card.ts
export type { Suit, Rank, Card } from "./card";
export {
  RANKS_BY_ORDER,
  getRankValue,
  isTrump,
} from "./card";

// deck.ts
export {
  createDeck36,
  shuffleDeck,
  drawCard,
  peekTrump,
} from "./deck";
export type { Rng } from "./deck";

// state.ts
export type {
  PlayerState,
  TablePair,
  TurnPhase,
  GameState,
} from "./state";

// setup.ts
export { createInitialGame } from "./setup";

// rules.ts
export {
  canAttackWithCard,
  canDefendWithCard,
  getTableRanks,
  findFirstUncoveredPair,
  canThrowInWithCard,
} from "./rules";
