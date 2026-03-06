import type { CardId } from "./cards";
import type { PlayerId } from "./game";

export type AttackAction = {
  type: "attack";
  playerId: PlayerId;
  cardIds: CardId[];
};

export type DefendAction = {
  type: "defend";
  playerId: PlayerId;
  attackIndex: number;
  cardId: CardId;
};

export type ThrowInAction = {
  type: "throw_in";
  playerId: PlayerId;
  cardIds: CardId[];
};

export type TransferAction = {
  type: "transfer";
  playerId: PlayerId;
  cardId: CardId;
};

export type TakeAction = {
  type: "take";
  playerId: PlayerId;
};

export type BeatAction = {
  type: "beat";
  playerId: PlayerId;
};

export type PassAction = {
  type: "pass";
  playerId: PlayerId;
};

export type GameAction =
  | AttackAction
  | DefendAction
  | ThrowInAction
  | TransferAction
  | TakeAction
  | BeatAction
  | PassAction;