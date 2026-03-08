import test from "node:test";
import assert from "node:assert/strict";

import {
  applyAction,
  applyTransferAction,
  cloneGameState,
  createEmptyGameState,
  resolveSuccessfulDefense,
  withEndgameUpdated,
  withHandsRefilledFromDeck,
  withRoundFlagsReset,
} from "../dist/index.js";

function card(id, rank, suit = "clubs") {
  return { id, rank, suit };
}

function createState(overrides = {}) {
  const state = createEmptyGameState();

  return {
    ...state,
    matchId: "test-match",
    mode: "simple",
    phase: "attack",
    players: [
      {
        id: "p1",
        name: "P1",
        hand: [],
        isAttacker: true,
        isDefender: false,
        hasPassed: false,
      },
      {
        id: "p2",
        name: "P2",
        hand: [],
        isAttacker: false,
        isDefender: true,
        hasPassed: false,
      },
      {
        id: "p3",
        name: "P3",
        hand: [],
        isAttacker: false,
        isDefender: false,
        hasPassed: false,
      },
    ],
    attackerId: "p1",
    defenderId: "p2",
    currentTurnPlayerId: "p1",
    trumpSuit: "hearts",
    trumpCard: card("trump", "A", "hearts"),
    deck: [],
    discard: [],
    table: { pairs: [] },
    winnerIds: [],
    loserId: null,
    version: 1,
    ...overrides,
  };
}

function player(state, playerId) {
  return state.players.find((entry) => entry.id === playerId);
}

test("throw_in adds attack cards during defense", () => {
  const state = createState({
    phase: "defense",
    currentTurnPlayerId: "p2",
    players: [
      {
        id: "p1",
        name: "P1",
        hand: [card("a2", "7", "spades")],
        isAttacker: true,
        isDefender: false,
        hasPassed: false,
      },
      {
        id: "p2",
        name: "P2",
        hand: [card("d1", "8", "clubs"), card("d2", "Q", "hearts")],
        isAttacker: false,
        isDefender: true,
        hasPassed: false,
      },
      {
        id: "p3",
        name: "P3",
        hand: [],
        isAttacker: false,
        isDefender: false,
        hasPassed: false,
      },
    ],
    table: {
      pairs: [{ attack: card("a1", "7", "clubs") }],
    },
  });

  const next = applyAction(state, {
    type: "throw_in",
    playerId: "p1",
    cardIds: ["a2"],
  });

  assert.equal(next.table.pairs.length, 2);
  assert.equal(next.table.pairs[1]?.attack.id, "a2");
  assert.equal(player(next, "p1")?.hand.length, 0);
  assert.equal(next.phase, "defense");
});

test("cloneGameState returns deep-enough copy for engine mutations", () => {
  const state = createState({
    players: [
      {
        id: "p1",
        name: "P1",
        hand: [card("a1", "7", "clubs")],
        isAttacker: true,
        isDefender: false,
        hasPassed: false,
      },
      {
        id: "p2",
        name: "P2",
        hand: [],
        isAttacker: false,
        isDefender: true,
        hasPassed: true,
      },
      {
        id: "p3",
        name: "P3",
        hand: [],
        isAttacker: false,
        isDefender: false,
        hasPassed: false,
      },
    ],
  });

  const next = cloneGameState(state);
  next.players[0].hand.pop();
  next.players[1].hasPassed = false;
  next.deck.push(card("deck1", "6", "spades"));

  assert.equal(player(state, "p1")?.hand.length, 1);
  assert.equal(player(state, "p2")?.hasPassed, true);
  assert.equal(state.deck.length, 0);
});

test("transfer changes defender in transfer mode", () => {
  const state = createState({
    mode: "transfer",
    phase: "defense",
    currentTurnPlayerId: "p2",
    players: [
      {
        id: "p1",
        name: "P1",
        hand: [],
        isAttacker: true,
        isDefender: false,
        hasPassed: false,
      },
      {
        id: "p2",
        name: "P2",
        hand: [card("t1", "7", "diamonds")],
        isAttacker: false,
        isDefender: true,
        hasPassed: false,
      },
      {
        id: "p3",
        name: "P3",
        hand: [card("x1", "9", "spades"), card("x2", "10", "spades")],
        isAttacker: false,
        isDefender: false,
        hasPassed: false,
      },
    ],
    table: {
      pairs: [{ attack: card("a1", "7", "clubs") }],
    },
  });

  const next = applyAction(state, {
    type: "transfer",
    playerId: "p2",
    cardId: "t1",
  });

  assert.equal(next.defenderId, "p3");
  assert.equal(next.currentTurnPlayerId, "p3");
  assert.equal(next.table.pairs.length, 2);
  assert.equal(next.table.pairs[1]?.attack.id, "t1");
});

test("applyTransferAction is pure and does not mutate input state", () => {
  const state = createState({
    mode: "transfer",
    phase: "defense",
    currentTurnPlayerId: "p2",
    players: [
      {
        id: "p1",
        name: "P1",
        hand: [],
        isAttacker: true,
        isDefender: false,
        hasPassed: false,
      },
      {
        id: "p2",
        name: "P2",
        hand: [card("t1", "7", "diamonds")],
        isAttacker: false,
        isDefender: true,
        hasPassed: false,
      },
      {
        id: "p3",
        name: "P3",
        hand: [card("x1", "9", "spades"), card("x2", "10", "spades")],
        isAttacker: false,
        isDefender: false,
        hasPassed: false,
      },
    ],
    table: {
      pairs: [{ attack: card("a1", "7", "clubs") }],
    },
  });

  const next = applyTransferAction(state, {
    type: "transfer",
    playerId: "p2",
    cardId: "t1",
  });

  assert.equal(state.defenderId, "p2");
  assert.equal(player(state, "p2")?.hand.length, 1);
  assert.equal(next.defenderId, "p3");
  assert.equal(player(next, "p2")?.hand.length, 0);
});

test("take moves table cards to defender hand and keeps attacker initiative", () => {
  const state = createState({
    phase: "defense",
    currentTurnPlayerId: "p2",
    players: [
      {
        id: "p1",
        name: "P1",
        hand: [],
        isAttacker: true,
        isDefender: false,
        hasPassed: false,
      },
      {
        id: "p2",
        name: "P2",
        hand: [card("d1", "9", "clubs")],
        isAttacker: false,
        isDefender: true,
        hasPassed: false,
      },
      {
        id: "p3",
        name: "P3",
        hand: [],
        isAttacker: false,
        isDefender: false,
        hasPassed: false,
      },
    ],
    table: {
      pairs: [
        { attack: card("a1", "7", "clubs"), defense: card("b1", "8", "clubs") },
        { attack: card("a2", "7", "spades") },
      ],
    },
  });

  const next = applyAction(state, {
    type: "take",
    playerId: "p2",
  });

  assert.equal(next.phase, "attack");
  assert.equal(next.attackerId, "p1");
  assert.equal(next.defenderId, "p2");
  assert.equal(next.table.pairs.length, 0);
  assert.deepEqual(
    player(next, "p2")?.hand.map((entry) => entry.id),
    ["d1", "a1", "b1", "a2"]
  );
});

test("successful defense resolves round, refills hands, and rotates attacker", () => {
  const state = createState({
    phase: "defense",
    currentTurnPlayerId: "p2",
    deck: [card("deck1", "6", "spades"), card("deck2", "K", "spades")],
    players: [
      {
        id: "p1",
        name: "P1",
        hand: [],
        isAttacker: true,
        isDefender: false,
        hasPassed: false,
      },
      {
        id: "p2",
        name: "P2",
        hand: [card("d1", "9", "clubs")],
        isAttacker: false,
        isDefender: true,
        hasPassed: false,
      },
      {
        id: "p3",
        name: "P3",
        hand: [card("p3c", "J", "diamonds")],
        isAttacker: false,
        isDefender: false,
        hasPassed: false,
      },
    ],
    table: {
      pairs: [{ attack: card("a1", "8", "clubs") }],
    },
  });

  const next = applyAction(state, {
    type: "defend",
    playerId: "p2",
    attackIndex: 0,
    cardId: "d1",
  });

  assert.equal(next.phase, "attack");
  assert.equal(next.table.pairs.length, 0);
  assert.equal(next.discard.length, 2);
  assert.equal(next.attackerId, "p2");
  assert.equal(next.defenderId, "p3");
  assert.equal(player(next, "p2")?.hand[0]?.id, "deck1");
  assert.equal(player(next, "p3")?.hand[1]?.id, "deck2");
});

test("resolveSuccessfulDefense can be tested directly as a pure helper", () => {
  const state = createState({
    phase: "defense",
    currentTurnPlayerId: "p2",
    deck: [card("deck1", "6", "spades")],
    players: [
      {
        id: "p1",
        name: "P1",
        hand: [],
        isAttacker: true,
        isDefender: false,
        hasPassed: true,
      },
      {
        id: "p2",
        name: "P2",
        hand: [],
        isAttacker: false,
        isDefender: true,
        hasPassed: false,
      },
      {
        id: "p3",
        name: "P3",
        hand: [card("p3c", "J", "diamonds")],
        isAttacker: false,
        isDefender: false,
        hasPassed: false,
      },
    ],
    table: {
      pairs: [{ attack: card("a1", "8", "clubs"), defense: card("d1", "9", "clubs") }],
    },
  });

  const next = resolveSuccessfulDefense(state);

  assert.equal(state.table.pairs.length, 1);
  assert.equal(next.table.pairs.length, 0);
  assert.equal(next.discard.length, 2);
  assert.equal(next.attackerId, "p2");
  assert.equal(next.defenderId, "p3");
  assert.equal(player(next, "p1")?.hasPassed, false);
});

test("pass marks participant and blocks future throw_in", () => {
  const state = createState({
    phase: "defense",
    currentTurnPlayerId: "p2",
    players: [
      {
        id: "p1",
        name: "P1",
        hand: [card("a2", "7", "spades")],
        isAttacker: true,
        isDefender: false,
        hasPassed: false,
      },
      {
        id: "p2",
        name: "P2",
        hand: [card("d1", "8", "clubs")],
        isAttacker: false,
        isDefender: true,
        hasPassed: false,
      },
      {
        id: "p3",
        name: "P3",
        hand: [],
        isAttacker: false,
        isDefender: false,
        hasPassed: false,
      },
    ],
    table: {
      pairs: [{ attack: card("a1", "7", "clubs") }],
    },
  });

  const passed = applyAction(state, {
    type: "pass",
    playerId: "p1",
  });

  assert.equal(player(passed, "p1")?.hasPassed, true);
  assert.throws(() =>
    applyAction(passed, {
      type: "throw_in",
      playerId: "p1",
      cardIds: ["a2"],
    })
  );
});

test("endgame marks winners and loser when one active player remains", () => {
  const state = createState({
    phase: "defense",
    currentTurnPlayerId: "p2",
    deck: [],
    players: [
      {
        id: "p1",
        name: "P1",
        hand: [],
        isAttacker: true,
        isDefender: false,
        hasPassed: false,
      },
      {
        id: "p2",
        name: "P2",
        hand: [card("d1", "9", "clubs")],
        isAttacker: false,
        isDefender: true,
        hasPassed: false,
      },
      {
        id: "p3",
        name: "P3",
        hand: [],
        isAttacker: false,
        isDefender: false,
        hasPassed: false,
      },
    ],
    table: {
      pairs: [{ attack: card("a1", "8", "clubs") }],
    },
  });

  const next = applyAction(state, {
    type: "defend",
    playerId: "p2",
    attackIndex: 0,
    cardId: "d1",
  });

  assert.equal(next.phase, "finished");
  assert.equal(next.loserId, "p2");
  assert.deepEqual(next.winnerIds.sort(), ["p1", "p3"]);
  assert.equal(next.currentTurnPlayerId, null);
});

test("withHandsRefilledFromDeck refills from the requested player order", () => {
  const state = createState({
    deck: [
      card("d1", "6", "clubs"),
      card("d2", "7", "clubs"),
      card("d3", "8", "clubs"),
      card("d4", "9", "clubs"),
    ],
    players: [
      {
        id: "p1",
        name: "P1",
        hand: [card("p1c", "Q", "spades")],
        isAttacker: true,
        isDefender: false,
        hasPassed: false,
      },
      {
        id: "p2",
        name: "P2",
        hand: [card("p2c", "K", "spades")],
        isAttacker: false,
        isDefender: true,
        hasPassed: false,
      },
      {
        id: "p3",
        name: "P3",
        hand: [card("p3c", "A", "spades")],
        isAttacker: false,
        isDefender: false,
        hasPassed: false,
      },
    ],
  });

  const next = withHandsRefilledFromDeck(state, "p2");

  assert.deepEqual(
    player(next, "p2")?.hand.map((entry) => entry.id),
    ["p2c", "d1", "d2", "d3", "d4"]
  );
  assert.equal(player(next, "p1")?.hand.length, 1);
  assert.equal(state.deck.length, 4);
  assert.equal(next.deck.length, 0);
});

test("withRoundFlagsReset and withEndgameUpdated are pure helpers", () => {
  const state = createState({
    deck: [],
    players: [
      {
        id: "p1",
        name: "P1",
        hand: [],
        isAttacker: true,
        isDefender: false,
        hasPassed: true,
      },
      {
        id: "p2",
        name: "P2",
        hand: [card("p2c", "K", "spades")],
        isAttacker: false,
        isDefender: true,
        hasPassed: true,
      },
      {
        id: "p3",
        name: "P3",
        hand: [],
        isAttacker: false,
        isDefender: false,
        hasPassed: false,
      },
    ],
  });

  const reset = withRoundFlagsReset(state);
  const ended = withEndgameUpdated(reset);

  assert.equal(player(state, "p1")?.hasPassed, true);
  assert.equal(player(reset, "p1")?.hasPassed, false);
  assert.equal(ended.phase, "finished");
  assert.equal(ended.loserId, "p2");
});
