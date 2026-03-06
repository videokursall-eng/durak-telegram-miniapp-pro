import type { Card } from "../models/cards";
import type { PlayerState } from "../models/game";

type DealCardsOptions = {
  players: PlayerState[];
  deck: Card[];
  cardsPerPlayer?: number;
};

type DealCardsResult = {
  players: PlayerState[];
  deck: Card[];
};

export function dealCards(options: DealCardsOptions): DealCardsResult {
  const cardsPerPlayer = options.cardsPerPlayer ?? 6;
  const deck = [...options.deck];
  const players = options.players.map((player) => ({
    ...player,
    hand: [...player.hand],
  }));

  for (let round = 0; round < cardsPerPlayer; round++) {
    for (const player of players) {
      const card = deck.shift();
      if (!card) {
        return { players, deck };
      }
      player.hand.push(card);
    }
  }

  return { players, deck };
}