import type { Card, CardId, Suit } from "./cards";

export type GameMode = "simple" | "transfer";

export type GamePhase =
  | "lobby"
  | "dealing"
  | "attack"
  | "defense"
  | "throw_in"
  | "resolution"
  | "finished";

export type PlayerId = string;

export type PlayerState = {
  id: PlayerId;
  name: string;
  hand: Card[];
  isAttacker: boolean;
  isDefender: boolean;
  hasPassed: boolean;
};

export type TablePair = {
  attack: Card;
  defense?: Card;
};

export type TableState = {
  pairs: TablePair[];
};

export type GameState = {
  matchId: string;
  mode: GameMode;
  phase: GamePhase;
  players: PlayerState[];
  attackerId: PlayerId | null;
  defenderId: PlayerId | null;
  currentTurnPlayerId: PlayerId | null;
  trumpSuit: Suit | null;
  trumpCard: Card | null;
  deck: Card[];
  discard: Card[];
  table: TableState;
  winnerIds: PlayerId[];
  loserId: PlayerId | null;
  version: number;
};

export function createEmptyGameState(): GameState {
  return {
    matchId: "",
    mode: "simple",
    phase: "lobby",
    players: [],
    attackerId: null,
    defenderId: null,
    currentTurnPlayerId: null,
    trumpSuit: null,
    trumpCard: null,
    deck: [],
    discard: [],
    table: {
      pairs: [],
    },
    winnerIds: [],
    loserId: null,
    version: 0,
  };
}

export function getPlayerById(
  state: GameState,
  playerId: PlayerId
): PlayerState | undefined {
  return state.players.find((player) => player.id === playerId);
}

export function getHandCardIds(player: PlayerState): CardId[] {
  return player.hand.map((card) => card.id);
}