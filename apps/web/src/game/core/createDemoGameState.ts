import {
  startGame,
  type Card,
  type GameState,
  type Suit as SharedSuit,
  type Rank as SharedRank,
} from "@durak/shared";

export type ViewSuit = "♣" | "♦" | "♥" | "♠";
export type ViewRank = SharedRank;

export type ViewCardModel = {
  id: string;
  suit: ViewSuit;
  rank: ViewRank;
  faceUp: boolean;
};

function mapSuitToView(suit: SharedSuit): ViewSuit {
  switch (suit) {
    case "clubs":
      return "♣";
    case "diamonds":
      return "♦";
    case "hearts":
      return "♥";
    case "spades":
      return "♠";
  }
}

function mapCardToView(card: Card): ViewCardModel {
  return {
    id: card.id,
    suit: mapSuitToView(card.suit),
    rank: card.rank,
    faceUp: true,
  };
}

export type DemoFrontendGameState = {
  raw: GameState;
  myHand: ViewCardModel[];
  playerCount: number;
};

export function createDemoGameState(): DemoFrontendGameState {
  const state = startGame({
    matchId: "demo-match",
    mode: "simple",
    players: [
      { id: "p1", name: "You" },
      { id: "p2", name: "P2" },
      { id: "p3", name: "P3" },
      { id: "p4", name: "P4" },
    ],
  });

  const me = state.players.find((player) => player.id === "p1");

  return {
    raw: state,
    myHand: (me?.hand ?? []).map(mapCardToView),
    playerCount: state.players.length,
  };
}
