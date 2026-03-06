import type { Card } from "../models/cards";
import type { GameState, PlayerId, TablePair } from "../models/game";

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

  const player = findPlayer(state, playerId);
  if (!player) return false;

  const cards = cardIds.map((cardId) => player.hand.find((card) => card.id === cardId));
  if (cards.some((card) => !card)) return false;

  if (state.table.pairs.length === 0) {
    return true;
  }

  const ranksOnTable = new Set<string>();
  for (const pair of state.table.pairs) {
    ranksOnTable.add(pair.attack.rank);
    if (pair.defense) ranksOnTable.add(pair.defense.rank);
  }

  return cards.every((card) => card && ranksOnTable.has(card.rank));
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
  return pairs.findIndex((pair) => !pair.defense);
}