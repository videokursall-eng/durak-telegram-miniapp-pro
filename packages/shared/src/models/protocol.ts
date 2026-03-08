import type { GameAction } from "./actions.js";
import type { GameState } from "./game.js";
import type { GameMode } from "./game.js";
import type { RoomSnapshot } from "./room.js";

export type RoomStateMessage = {
  type: "room.state";
  roomId: string;
  state: GameState;
};

export type ActionMessage = {
  type: "action";
  payload: GameAction;
};

export type RoomCreateMessage = {
  type: "room.create";
};

export type RoomJoinMessage = {
  type: "room.join";
  roomId: string;
};

export type RoomLeaveMessage = {
  type: "room.leave";
  roomId: string;
};

export type RoomStartMessage = {
  type: "room.start";
  roomId: string;
  mode: GameMode;
};

export type PlayerReconnectMessage = {
  type: "player.reconnect";
  roomId: string;
  sessionToken: string;
};

export type ErrorMessage = {
  type: "error";
  message: string;
  code?: string;
};

/** Sent once by the server after WebSocket handshake and auth; signals "ws client registered" and ready for room messages. */
export type ConnectionReadyMessage = {
  type: "connection.ready";
  /** Current session/player info (no secrets). Omitted only if server cannot provide it. */
  user?: {
    telegramUserId: string;
    displayName: string;
  };
};

export type RoomCreatedMessage = {
  type: "room.created";
  room: RoomSnapshot;
  playerId: string;
  sessionToken: string;
  isHost: boolean;
};

export type RoomJoinedMessage = {
  type: "room.joined";
  room: RoomSnapshot;
  playerId: string;
  sessionToken: string;
  isHost: boolean;
};

export type RoomLeftMessage = {
  type: "room.left";
  roomId: string;
  playerId: string;
};

export type RoomPlayersMessage = {
  type: "room.players";
  room: RoomSnapshot;
};

export type RoomStartedMessage = {
  type: "room.started";
  room: RoomSnapshot;
  state: GameState;
};

export type PlayerReconnectedMessage = {
  type: "player.reconnected";
  room: RoomSnapshot;
  playerId: string;
  sessionToken: string;
  isHost: boolean;
  state: GameState | null;
};

export type ClientToServerMessage =
  | ActionMessage
  | RoomCreateMessage
  | RoomJoinMessage
  | RoomLeaveMessage
  | RoomStartMessage
  | PlayerReconnectMessage;

export type ServerToClientMessage =
  | ConnectionReadyMessage
  | RoomStateMessage
  | ErrorMessage
  | RoomCreatedMessage
  | RoomJoinedMessage
  | RoomLeftMessage
  | RoomPlayersMessage
  | RoomStartedMessage
  | PlayerReconnectedMessage;
