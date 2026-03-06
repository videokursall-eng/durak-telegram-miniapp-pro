import type { Card } from "../models/cards";
import type { AttackAction, DefendAction, GameAction } from "../models/actions";
import type { GameState, PlayerState } from "../models/game";
import {
  canAttack,
  canDefend,
  findCardInHand,
  findFirstUncoveredPair,
} from "./rules";

function clonePlayer(player: PlayerState): PlayerState {
  return {
    ...player,
    hand: [...player.hand],
  };
}

function cloneState(state: GameState): GameState {
  return {
    ...state,
    players: state.players.map(clonePlayer),
    deck: [...state.deck],
    discard: [...state.discard],
    table: {
      pairs: state.table.pairs.map((pair) => ({
        attack: pair.attack,
        defense: pair.defense,
      })),
    },
    winnerIds: [...state.winnerIds],
  };
}

function removeCardFromPlayerHand(player: PlayerState, cardId: string): Card {
  const index = player.hand.findIndex((card) => card.id === cardId);
  if (index === -1) {
    throw new Error(`Card not found in player hand: ${cardId}`);
  }

  const [card] = player.hand.splice(index, 1);
  return card;
}

function applyAttack(state: GameState, action: AttackAction): GameState {
  if (!canAttack(state, action.playerId, action.cardIds)) {
    throw new Error("Invalid attack action");
  }

  const next = cloneState(state);
  const player = next.players.find((p) => p.id === action.playerId);

  if (!player) {
    throw new Error("Attacker not found");
  }

  for (const cardId of action.cardIds) {
    const card = removeCardFromPlayerHand(player, cardId);
    next.table.pairs.push({
      attack: card,
    });
  }

  next.phase = "defense";
  next.currentTurnPlayerId = next.defenderId;
  next.version += 1;

  return next;
}

function applyDefend(state: GameState, action: DefendAction): GameState {
  if (!canDefend(state, action.playerId, action.attackIndex, action.cardId)) {
    throw new Error("Invalid defend action");
  }

  const next = cloneState(state);
  const player = next.players.find((p) => p.id === action.playerId);

  if (!player) {
    throw new Error("Defender not found");
  }

  const defendCard = removeCardFromPlayerHand(player, action.cardId);
  const pair = next.table.pairs[action.attackIndex];

  if (!pair) {
    throw new Error("Attack pair not found");
  }

  pair.defense = defendCard;

  const uncoveredIndex = findFirstUncoveredPair(next.table.pairs);

  if (uncoveredIndex === -1) {
    next.phase = "attack";
    next.currentTurnPlayerId = next.attackerId;
  } else {
    next.phase = "defense";
    next.currentTurnPlayerId = next.defenderId;
  }

  next.version += 1;

  return next;
}

export function applyAction(state: GameState, action: GameAction): GameState {
  switch (action.type) {
    case "attack":
      return applyAttack(state, action);

    case "defend":
      return applyDefend(state, action);

    default:
      throw new Error(`Action type not implemented yet: ${action.type}`);
  }
}