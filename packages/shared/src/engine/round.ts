import type { Card } from "../models/cards.js";
import type { GameState, PlayerId, PlayerState, TablePair } from "../models/game.js";

const MAX_ATTACK_CARDS = 6;

function clonePlayer(player: PlayerState): PlayerState {
  return {
    ...player,
    hand: [...player.hand],
  };
}

export function cloneGameState(state: GameState): GameState {
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

function uniquePlayerIds(ids: PlayerId[]): PlayerId[] {
  return [...new Set(ids)];
}

export function isPlayerFinished(state: GameState, playerId: PlayerId): boolean {
  return state.winnerIds.includes(playerId) || state.loserId === playerId;
}

export function getActivePlayers(state: GameState): PlayerState[] {
  return state.players.filter((player) => !isPlayerFinished(state, player.id));
}

export function getActivePlayerIds(state: GameState): PlayerId[] {
  return getActivePlayers(state).map((player) => player.id);
}

export function getPlayerById(state: GameState, playerId: PlayerId | null): PlayerState | undefined {
  if (!playerId) {
    return undefined;
  }

  return state.players.find((player) => player.id === playerId);
}

export function getNextActivePlayerId(
  state: GameState,
  fromPlayerId: PlayerId | null
): PlayerId | null {
  const activePlayers = getActivePlayers(state);
  if (!activePlayers.length || !fromPlayerId) {
    return null;
  }

  const index = activePlayers.findIndex((player) => player.id === fromPlayerId);
  if (index === -1) {
    return activePlayers[0]?.id ?? null;
  }

  const nextIndex = (index + 1) % activePlayers.length;
  return activePlayers[nextIndex]?.id ?? null;
}

export function getFirstActivePlayerFrom(
  state: GameState,
  preferredPlayerId: PlayerId | null
): PlayerId | null {
  const activePlayers = getActivePlayers(state);
  if (!activePlayers.length) {
    return null;
  }

  if (!preferredPlayerId) {
    return activePlayers[0]?.id ?? null;
  }

  const index = activePlayers.findIndex((player) => player.id === preferredPlayerId);
  if (index !== -1) {
    return preferredPlayerId;
  }

  return getNextActivePlayerId(state, preferredPlayerId);
}

export function getRanksOnTable(state: GameState): Set<Card["rank"]> {
  const ranks = new Set<Card["rank"]>();

  for (const pair of state.table.pairs) {
    ranks.add(pair.attack.rank);
    if (pair.defense) {
      ranks.add(pair.defense.rank);
    }
  }

  return ranks;
}

export function allCardsShareRank(cards: Card[]): boolean {
  if (cards.length <= 1) {
    return true;
  }

  return cards.every((card) => card.rank === cards[0]?.rank);
}

export function countCoveredPairs(pairs: TablePair[]): number {
  return pairs.filter((pair) => pair.defense).length;
}

export function findFirstUncoveredPairIndex(pairs: TablePair[]): number {
  return pairs.findIndex((pair) => !pair.defense);
}

export function areAllPairsCovered(state: GameState): boolean {
  return state.table.pairs.length > 0 && findFirstUncoveredPairIndex(state.table.pairs) === -1;
}

export function getDefenderAttackCapacity(state: GameState): number {
  const defender = getPlayerById(state, state.defenderId);
  if (!defender) {
    return 0;
  }

  return Math.min(MAX_ATTACK_CARDS, defender.hand.length + countCoveredPairs(state.table.pairs));
}

export function canAddAttackCards(state: GameState, extraCardCount: number): boolean {
  return state.table.pairs.length + extraCardCount <= getDefenderAttackCapacity(state);
}

export function getRoundParticipants(state: GameState): PlayerState[] {
  return getActivePlayers(state).filter((player) => player.id !== state.defenderId);
}

export function resetRoundFlags(state: GameState) {
  for (const player of state.players) {
    player.hasPassed = false;
  }
}

export function syncPlayerRoles(
  state: GameState,
  attackerId: PlayerId | null,
  defenderId: PlayerId | null
) {
  state.attackerId = attackerId;
  state.defenderId = defenderId;
  state.currentTurnPlayerId = attackerId;

  for (const player of state.players) {
    player.isAttacker = player.id === attackerId;
    player.isDefender = player.id === defenderId;
  }
}

export function collectTableCards(state: GameState): Card[] {
  const cards: Card[] = [];

  for (const pair of state.table.pairs) {
    cards.push(pair.attack);
    if (pair.defense) {
      cards.push(pair.defense);
    }
  }

  return cards;
}

export function clearTable(state: GameState) {
  state.table.pairs = [];
}

export function refillHandsFromDeck(state: GameState, startingPlayerId: PlayerId | null) {
  const activePlayers = getActivePlayers(state);
  if (!activePlayers.length || !startingPlayerId) {
    return;
  }

  const startIndex = activePlayers.findIndex((player) => player.id === startingPlayerId);
  const orderedPlayers =
    startIndex === -1
      ? activePlayers
      : [...activePlayers.slice(startIndex), ...activePlayers.slice(0, startIndex)];

  for (const player of orderedPlayers) {
    while (player.hand.length < 6) {
      const card = state.deck.shift();
      if (!card) {
        return;
      }

      player.hand.push(card);
    }
  }
}

export function updateEndgameState(state: GameState) {
  if (state.deck.length === 0) {
    const emptyHandWinners = state.players
      .filter((player) => player.hand.length === 0 && !isPlayerFinished(state, player.id))
      .map((player) => player.id);

    state.winnerIds = uniquePlayerIds([...state.winnerIds, ...emptyHandWinners]);
  }

  const activePlayerIds = getActivePlayerIds(state);
  if (activePlayerIds.length === 1) {
    const loserId = activePlayerIds[0] ?? null;
    state.loserId = loserId;
    state.winnerIds = uniquePlayerIds(
      state.players
        .map((player) => player.id)
        .filter((playerId) => playerId !== loserId)
    );
    state.phase = "finished";
    state.attackerId = null;
    state.defenderId = null;
    state.currentTurnPlayerId = null;

    for (const player of state.players) {
      player.isAttacker = false;
      player.isDefender = false;
      player.hasPassed = false;
    }
  }
}

export function finalizeSuccessfulDefense(state: GameState) {
  const nextAttackerStart = getFirstActivePlayerFrom(state, state.defenderId);

  state.discard.push(...collectTableCards(state));
  clearTable(state);
  resetRoundFlags(state);
  refillHandsFromDeck(state, nextAttackerStart);
  updateEndgameState(state);

  if (state.phase === "finished") {
    return;
  }

  const attackerId = getFirstActivePlayerFrom(state, nextAttackerStart);
  const defenderId = getNextActivePlayerId(state, attackerId);
  syncPlayerRoles(state, attackerId, defenderId);
  state.phase = "attack";
}

export function finalizeTake(state: GameState) {
  const currentDefender = getPlayerById(state, state.defenderId);
  const nextAttackerStart = getFirstActivePlayerFrom(state, state.attackerId);

  currentDefender?.hand.push(...collectTableCards(state));
  clearTable(state);
  resetRoundFlags(state);
  refillHandsFromDeck(state, nextAttackerStart);
  updateEndgameState(state);

  if (state.phase === "finished") {
    return;
  }

  const attackerId = getFirstActivePlayerFrom(state, nextAttackerStart);
  const defenderId = getNextActivePlayerId(state, attackerId);
  syncPlayerRoles(state, attackerId, defenderId);
  state.phase = "attack";
}

export function withRoundFlagsReset(state: GameState): GameState {
  const next = cloneGameState(state);
  resetRoundFlags(next);
  return next;
}

export function withPlayerRoles(
  state: GameState,
  attackerId: PlayerId | null,
  defenderId: PlayerId | null
): GameState {
  const next = cloneGameState(state);
  syncPlayerRoles(next, attackerId, defenderId);
  return next;
}

export function withHandsRefilledFromDeck(
  state: GameState,
  startingPlayerId: PlayerId | null
): GameState {
  const next = cloneGameState(state);
  refillHandsFromDeck(next, startingPlayerId);
  return next;
}

export function withEndgameUpdated(state: GameState): GameState {
  const next = cloneGameState(state);
  updateEndgameState(next);
  return next;
}

export function resolveSuccessfulDefense(state: GameState): GameState {
  const next = cloneGameState(state);
  finalizeSuccessfulDefense(next);
  return next;
}

export function resolveTake(state: GameState): GameState {
  const next = cloneGameState(state);
  finalizeTake(next);
  return next;
}
