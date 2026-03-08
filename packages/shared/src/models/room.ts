import type { GameMode, PlayerId } from "./game";

export type RoomStatus = "lobby" | "in_game";

export type RoomPlayerSnapshot = {
  playerId: PlayerId;
  name: string;
  isHost: boolean;
  isConnected: boolean;
};

export type RoomSnapshot = {
  roomId: string;
  status: RoomStatus;
  hostPlayerId: PlayerId | null;
  mode: GameMode | null;
  players: RoomPlayerSnapshot[];
};
