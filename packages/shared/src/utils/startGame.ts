import { createDeck36, type Card } from "../models/cards.js";
import {
  createEmptyGameState,
  type GameMode,
  type GameState,
  type PlayerId,
  type PlayerState,
} from "../models/game.js";
import { shuffleDeck } from "./shuffleDeck.js";
import { dealCards } from "./dealCards.js";

type StartGamePlayer = {
  id: PlayerId;
  name: string;
};

type StartGameOptions = {
  matchId: string;
  mode?: GameMode;
  players: StartGamePlayer[];
};

function createInitialPlayers(players: StartGamePlayer[]): PlayerState[] {
  return players.map((player) => ({
    id: player.id,
    name: player.name,
    hand: [],
    isAttacker: false,
    isDefender: false,
    hasPassed: false,
  }));
}

function getLowestTrumpOwner(players: PlayerState[], trumpSuit: Card["suit"]): PlayerId | null {
  const rankOrder = ["6", "7", "8", "9", "10", "J", "Q", "K", "A"];

  let winner: { playerId: PlayerId; rankIndex: number } | null = null;

  for (const player of players) {
    for (const card of player.hand) {
      if (card.suit !== trumpSuit) continue;

      const rankIndex = rankOrder.indexOf(card.rank);
      if (rankIndex === -1) continue;

      if (!winner || rankIndex < winner.rankIndex) {
        winner = {
          playerId: player.id,
          rankIndex,
        };
      }
    }
  }

  return winner?.playerId ?? null;
}

function getNextPlayerId(players: PlayerState[], currentPlayerId: PlayerId | null): PlayerId | null {
  if (!players.length || !currentPlayerId) return null;

  const index = players.findIndex((player) => player.id === currentPlayerId);
  if (index === -1) return null;

  const nextIndex = (index + 1) % players.length;
  return players[nextIndex]?.id ?? null;
}

export function startGame(options: StartGameOptions): GameState {
  const mode = options.mode ?? "simple";

  const shuffledDeck = shuffleDeck(createDeck36());
  const initialPlayers = createInitialPlayers(options.players);

  const dealt = dealCards({
    players: initialPlayers,
    deck: shuffledDeck,
    cardsPerPlayer: 6,
  });

  const trumpCard = dealt.deck.length > 0 ? dealt.deck[dealt.deck.length - 1] : null;
  const trumpSuit = trumpCard?.suit ?? null;

  const attackerId = trumpSuit
    ? getLowestTrumpOwner(dealt.players, trumpSuit)
    : dealt.players[0]?.id ?? null;

  const defenderId = getNextPlayerId(dealt.players, attackerId);

  const players = dealt.players.map((player) => ({
    ...player,
    isAttacker: player.id === attackerId,
    isDefender: player.id === defenderId,
    hasPassed: false,
  }));

  const state = createEmptyGameState();

  return {
    ...state,
    matchId: options.matchId,
    mode,
    phase: "attack",
    players,
    attackerId,
    defenderId,
    currentTurnPlayerId: attackerId,
    trumpSuit,
    trumpCard,
    deck: dealt.deck,
    discard: [],
    table: {
      pairs: [],
    },
    winnerIds: [],
    loserId: null,
    version: 1,
  };
}