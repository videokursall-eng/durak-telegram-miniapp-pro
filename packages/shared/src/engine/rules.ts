import type { Card } from "../models/cards.js";
import type { GameState, PlayerId, TablePair } from "../models/game.js";
import {
  allCardsShareRank,
  canAddAttackCards,
  findFirstUncoveredPairIndex,
  getNextActivePlayerId,
  getPlayerById,
  getRanksOnTable,
  getRoundParticipants,
  isPlayerFinished,
} from "./round.js";

const RANK_ORDER = ["6", "7", "8", "9", "10", "J", "Q", "K", "A"] as const;

function getRankIndex(rank: Card["rank"]): number {
  return RANK_ORDER.indexOf(rank);
}

export function isPlayerTurn(state: GameState, playerId: PlayerId): boolean {
  return state.currentTurnPlayerId === playerId;
}

export function findPlayer(state: GameState, playerId: PlayerId) {
  return state.players.find((player) => player.id === playerId);
}

export function findCardInHand(state: GameState, playerId: PlayerId, cardId: string): Card | undefined {
  const player = findPlayer(state, playerId);
  return player?.hand.find((card) => card.id === cardId);
}

export function canAttack(state: GameState, playerId: PlayerId, cardIds: string[]): boolean {
  if (state.phase !== "attack") return false;
  if (!isPlayerTurn(state, playerId)) return false;
  if (state.attackerId !== playerId) return false;
  if (!cardIds.length) return false;
  if (state.table.pairs.length > 0) return false;
  if (isPlayerFinished(state, playerId)) return false;

  const player = findPlayer(state, playerId);
  if (!player) return false;

  const cards = cardIds.map((cardId) => player.hand.find((card) => card.id === cardId));
  if (cards.some((card) => !card)) return false;
  if (!allCardsShareRank(cards as Card[])) return false;

  return canAddAttackCards(state, cards.length);
}

export function canDefend(
  state: GameState,
  playerId: PlayerId,
  attackIndex: number,
  cardId: string
): boolean {
  if (state.phase !== "defense") return false;
  if (!isPlayerTurn(state, playerId)) return false;
  if (state.defenderId !== playerId) return false;

  const player = findPlayer(state, playerId);
  if (!player) return false;

  const defendCard = player.hand.find((card) => card.id === cardId);
  if (!defendCard) return false;

  const pair = state.table.pairs[attackIndex];
  if (!pair) return false;
  if (pair.defense) return false;

  return canBeat(pair.attack, defendCard, state.trumpSuit);
}

export function canThrowIn(state: GameState, playerId: PlayerId, cardIds: string[]): boolean {
  if (state.phase !== "defense") return false;
  if (state.table.pairs.length === 0) return false;
  if (!cardIds.length) return false;
  if (state.defenderId === playerId) return false;
  if (isPlayerFinished(state, playerId)) return false;

  const participant = getRoundParticipants(state).find((player) => player.id === playerId);
  if (!participant || participant.hasPassed) return false;

  const cards = cardIds.map((cardId) => participant.hand.find((card) => card.id === cardId));
  if (cards.some((card) => !card)) return false;
  if (!canAddAttackCards(state, cards.length)) return false;

  const ranksOnTable = getRanksOnTable(state);
  return cards.every((card) => card && ranksOnTable.has(card.rank));
}

export function canTransfer(state: GameState, playerId: PlayerId, cardId: string): boolean {
  if (state.mode !== "transfer") return false;
  if (state.phase !== "defense") return false;
  if (state.defenderId !== playerId) return false;
  if (!state.table.pairs.length) return false;
  if (state.table.pairs.some((pair) => pair.defense)) return false;

  const player = getPlayerById(state, playerId);
  const nextDefenderId = getNextActivePlayerId(state, playerId);
  const nextDefender = getPlayerById(state, nextDefenderId);
  if (!player || !nextDefender || nextDefender.id === state.attackerId) return false;

  const transferCard = player.hand.find((card) => card.id === cardId);
  if (!transferCard) return false;

  const ranksOnTable = getRanksOnTable(state);
  if (!ranksOnTable.has(transferCard.rank)) return false;

  const transferPairCount = state.table.pairs.length + 1;
  return transferPairCount <= Math.min(6, nextDefender.hand.length);
}

export function canTake(state: GameState, playerId: PlayerId): boolean {
  if (state.phase !== "defense") return false;
  if (state.defenderId !== playerId) return false;
  return state.table.pairs.length > 0;
}

export function canPass(state: GameState, playerId: PlayerId): boolean {
  if (state.phase !== "defense") return false;
  if (state.table.pairs.length === 0) return false;
  if (state.defenderId === playerId) return false;
  if (isPlayerFinished(state, playerId)) return false;

  const participant = getRoundParticipants(state).find((player) => player.id === playerId);
  if (!participant) return false;

  return !participant.hasPassed;
}

export function canBeat(
  attackCard: Card,
  defendCard: Card,
  trumpSuit: GameState["trumpSuit"]
): boolean {
  if (!trumpSuit) return false;

  const attackIsTrump = attackCard.suit === trumpSuit;
  const defendIsTrump = defendCard.suit === trumpSuit;

  if (attackCard.suit === defendCard.suit) {
    return getRankIndex(defendCard.rank) > getRankIndex(attackCard.rank);
  }

  if (!attackIsTrump && defendIsTrump) {
    return true;
  }

  return false;
}

export function findFirstUncoveredPair(pairs: TablePair[]): number {
  return findFirstUncoveredPairIndex(pairs);
}