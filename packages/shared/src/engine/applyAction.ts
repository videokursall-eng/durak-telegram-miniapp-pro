import type { Card } from "../models/cards.js";
import type {
  AttackAction,
  DefendAction,
  GameAction,
  PassAction,
  TakeAction,
  ThrowInAction,
  TransferAction,
} from "../models/actions.js";
import type { GameState, PlayerState } from "../models/game.js";
import {
  canAttack,
  canDefend,
  canPass,
  canTake,
  canThrowIn,
  canTransfer,
  findFirstUncoveredPair,
} from "./rules.js";
import {
  cloneGameState,
  getNextActivePlayerId,
  getPlayerById,
  resetRoundFlags,
  resolveSuccessfulDefense,
  resolveTake,
  syncPlayerRoles,
  updateEndgameState,
} from "./round.js";

function removeCardFromPlayerHand(player: PlayerState, cardId: string): Card {
  const index = player.hand.findIndex((card) => card.id === cardId);
  if (index === -1) {
    throw new Error(`Card not found in player hand: ${cardId}`);
  }

  const [card] = player.hand.splice(index, 1);
  return card;
}

export function applyAttackAction(state: GameState, action: AttackAction): GameState {
  if (!canAttack(state, action.playerId, action.cardIds)) {
    throw new Error("Invalid attack action");
  }

  const next = cloneGameState(state);
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

export function applyDefendAction(state: GameState, action: DefendAction): GameState {
  if (!canDefend(state, action.playerId, action.attackIndex, action.cardId)) {
    throw new Error("Invalid defend action");
  }

  const next = cloneGameState(state);
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
    const resolved = resolveSuccessfulDefense(next);
    resolved.version += 1;
    return resolved;
  } else {
    next.phase = "defense";
    next.currentTurnPlayerId = next.defenderId;
  }

  next.version += 1;

  return next;
}

export function applyThrowInAction(state: GameState, action: ThrowInAction): GameState {
  if (!canThrowIn(state, action.playerId, action.cardIds)) {
    throw new Error("Invalid throw-in action");
  }

  const next = cloneGameState(state);
  const player = next.players.find((candidate) => candidate.id === action.playerId);
  if (!player) {
    throw new Error("Throw-in player not found");
  }

  for (const cardId of action.cardIds) {
    const card = removeCardFromPlayerHand(player, cardId);
    next.table.pairs.push({ attack: card });
  }

  next.phase = "defense";
  next.currentTurnPlayerId = next.defenderId;
  next.version += 1;
  return next;
}

export function applyTransferAction(state: GameState, action: TransferAction): GameState {
  if (!canTransfer(state, action.playerId, action.cardId)) {
    throw new Error("Invalid transfer action");
  }

  const next = cloneGameState(state);
  const currentDefender = next.players.find((player) => player.id === action.playerId);
  if (!currentDefender) {
    throw new Error("Defender not found");
  }

  const transferCard = removeCardFromPlayerHand(currentDefender, action.cardId);
  next.table.pairs.push({ attack: transferCard });

  const newDefenderId = getNextActivePlayerId(next, action.playerId);
  syncPlayerRoles(next, next.attackerId, newDefenderId);
  resetRoundFlags(next);
  next.phase = "defense";
  next.currentTurnPlayerId = next.defenderId;
  next.version += 1;
  return next;
}

export function applyTakeAction(state: GameState, action: TakeAction): GameState {
  if (!canTake(state, action.playerId)) {
    throw new Error("Invalid take action");
  }

  const next = resolveTake(state);
  next.version += 1;
  return next;
}

export function applyPassAction(state: GameState, action: PassAction): GameState {
  if (!canPass(state, action.playerId)) {
    throw new Error("Invalid pass action");
  }

  const next = cloneGameState(state);
  const player = getPlayerById(next, action.playerId);
  if (!player) {
    throw new Error("Passing player not found");
  }

  player.hasPassed = true;
  updateEndgameState(next);
  next.version += 1;
  return next;
}

function assertNeverAction(action: never): never {
  throw new Error(`Action is not implemented: ${JSON.stringify(action)}`);
}

export function applyAction(state: GameState, action: GameAction): GameState {
  switch (action.type) {
    case "attack":
      return applyAttackAction(state, action);

    case "defend":
      return applyDefendAction(state, action);

    case "throw_in":
      return applyThrowInAction(state, action);

    case "transfer":
      return applyTransferAction(state, action);

    case "take":
      return applyTakeAction(state, action);

    case "pass":
      return applyPassAction(state, action);

    case "beat":
      throw new Error("Beat action is not used in auto-resolve mode");

    default:
      return assertNeverAction(action);
  }
}