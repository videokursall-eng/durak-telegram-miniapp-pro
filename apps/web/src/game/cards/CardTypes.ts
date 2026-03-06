export type Suit = "♠" | "♥" | "♦" | "♣";
export type Rank = "6" | "7" | "8" | "9" | "10" | "J" | "Q" | "K" | "A";

export type CardModel = {
  id: string;       // уникальный id
  suit: Suit;
  rank: Rank;
  faceUp: boolean;
};

export function cardLabel(c: CardModel) {
  return `${c.rank}${c.suit}`;
}

export function isRedSuit(s: Suit) {
  return s === "♥" || s === "♦";
}