export type Suit = "clubs" | "diamonds" | "hearts" | "spades";

export type Rank =
  | "6"
  | "7"
  | "8"
  | "9"
  | "10"
  | "J"
  | "Q"
  | "K"
  | "A";

export type CardId = string;

export type Card = {
  id: CardId;
  suit: Suit;
  rank: Rank;
};

export const SUITS: Suit[] = ["clubs", "diamonds", "hearts", "spades"];

export const RANKS: Rank[] = ["6", "7", "8", "9", "10", "J", "Q", "K", "A"];

export function createDeck36(): Card[] {
  const deck: Card[] = [];
  let index = 0;

  for (const suit of SUITS) {
    for (const rank of RANKS) {
      deck.push({
        id: `card_${index++}`,
        suit,
        rank,
      });
    }
  }

  return deck;
}