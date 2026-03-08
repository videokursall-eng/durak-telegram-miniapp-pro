import { randomUUID } from "node:crypto";
import {
  applyAction,
  startGame,
  type GameAction,
  type GameMode,
  type GameState,
  type PlayerId,
  type PlayerReconnectedMessage,
  type RoomCreatedMessage,
  type RoomJoinedMessage,
  type RoomLeftMessage,
  type RoomPlayerSnapshot,
  type RoomPlayersMessage,
  type RoomSnapshot,
  type RoomStartedMessage,
  type RoomStateMessage,
  type ServerToClientMessage,
} from "@durak/shared";
import type { TelegramUserIdentity } from "../auth/types";
import { hashRoomSessionToken, type RuntimeRoomState } from "../persistence/domain";

const MAX_ROOM_PLAYERS = 6;

export type RoomConnection = {
  id: string;
  send: (payload: ServerToClientMessage) => void;
};

type RoomMember = {
  playerId: PlayerId;
  telegramUserId: string;
  name: string;
  sessionToken: string | null;
  sessionTokenHash: string;
  isHost: boolean;
  isConnected: boolean;
  connectionId: string | null;
};

function createSessionToken() {
  return randomUUID();
}

function normalizePlayerName(name: string) {
  const trimmed = name.trim();
  return trimmed.length > 0 ? trimmed.slice(0, 24) : "Player";
}

function bindActionToPlayer(action: GameAction, playerId: PlayerId): GameAction {
  switch (action.type) {
    case "attack":
      return { ...action, playerId };
    case "defend":
      return { ...action, playerId };
    case "throw_in":
      return { ...action, playerId };
    case "transfer":
      return { ...action, playerId };
    case "take":
      return { ...action, playerId };
    case "beat":
      return { ...action, playerId };
    case "pass":
      return { ...action, playerId };
  }
}

export class GameRoom {
  readonly id: string;
  private state: GameState | null = null;
  private mode: GameMode | null = null;
  private members: RoomMember[] = [];
  private connections = new Map<string, RoomConnection>();
  private connectionToSession = new Map<string, string>();

  constructor(id: string, runtime?: RuntimeRoomState) {
    this.id = id;
    if (runtime) {
      this.mode = runtime.mode;
      this.state = runtime.state;
      this.members = runtime.members.map((member) => ({
        playerId: member.playerId,
        telegramUserId: member.telegramUserId,
        name: member.name,
        sessionToken: member.sessionToken,
        sessionTokenHash: member.sessionTokenHash,
        isHost: member.isHost,
        isConnected: false,
        connectionId: null,
      }));
    }
  }

  getSnapshot(): RoomSnapshot {
    return {
      roomId: this.id,
      status: this.state ? "in_game" : "lobby",
      hostPlayerId: this.members.find((member) => member.isHost)?.playerId ?? null,
      mode: this.mode,
      players: this.members.map<RoomPlayerSnapshot>((member) => ({
        playerId: member.playerId,
        name: member.name,
        isHost: member.isHost,
        isConnected: member.isConnected,
      })),
    };
  }

  getState() {
    return this.state;
  }

  isStarted() {
    return this.state !== null;
  }

  isEmpty() {
    return this.members.length === 0;
  }

  toRuntimeState(): RuntimeRoomState {
    return {
      roomCode: this.id,
      mode: this.mode,
      state: this.state,
      members: this.members.map((member) => ({
        playerId: member.playerId,
        telegramUserId: member.telegramUserId,
        name: member.name,
        sessionToken: member.sessionToken,
        sessionTokenHash: member.sessionTokenHash,
        isHost: member.isHost,
        isConnected: member.isConnected,
      })),
    };
  }

  getPlayerIdByConnection(connectionId: string) {
    return this.getMemberByConnection(connectionId)?.playerId ?? null;
  }

  createHost(user: TelegramUserIdentity, connection: RoomConnection): RoomCreatedMessage {
    if (this.members.length > 0) {
      throw new Error("Room already has a host");
    }

    const host = this.createMember(user, true);
    this.members.push(host);
    this.bindConnection(host, connection);
    const message: RoomCreatedMessage = {
      type: "room.created",
      room: this.getSnapshot(),
      playerId: host.playerId,
      sessionToken: this.requireSessionToken(host),
      isHost: true,
    };
    connection.send(message);
    this.broadcastPlayers();
    return message;
  }

  join(user: TelegramUserIdentity, connection: RoomConnection): RoomJoinedMessage {
    if (this.state) {
      throw new Error("Match already started");
    }
    if (this.members.length >= MAX_ROOM_PLAYERS) {
      throw new Error("Room is full");
    }
    if (this.members.some((member) => member.telegramUserId === user.telegramUserId)) {
      throw new Error("Telegram user is already in this room");
    }

    const member = this.createMember(user, false);
    this.members.push(member);
    this.bindConnection(member, connection);

    const message: RoomJoinedMessage = {
      type: "room.joined",
      room: this.getSnapshot(),
      playerId: member.playerId,
      sessionToken: this.requireSessionToken(member),
      isHost: false,
    };
    connection.send(message);
    this.broadcastPlayers();
    return message;
  }

  reconnect(
    user: TelegramUserIdentity,
    sessionToken: string,
    connection: RoomConnection
  ): PlayerReconnectedMessage {
    const sessionTokenHash = hashRoomSessionToken(sessionToken);
    const member = this.members.find((candidate) => candidate.sessionTokenHash === sessionTokenHash);
    if (!member) {
      throw new Error("Reconnect session not found");
    }
    if (member.telegramUserId !== user.telegramUserId) {
      throw new Error("Reconnect user does not match room session");
    }

    if (member.connectionId && member.connectionId !== connection.id) {
      this.connections.delete(member.connectionId);
      this.connectionToSession.delete(member.connectionId);
    }

    member.sessionToken = sessionToken;
    this.bindConnection(member, connection);
    const message: PlayerReconnectedMessage = {
      type: "player.reconnected",
      room: this.getSnapshot(),
      playerId: member.playerId,
      sessionToken: member.sessionToken,
      isHost: member.isHost,
      state: this.state,
    };
    connection.send(message);
    this.broadcastPlayers();
    if (this.state) {
      connection.send(this.createStateMessage());
    }
    return message;
  }

  leave(connectionId: string): RoomLeftMessage | null {
    const member = this.getMemberByConnection(connectionId);
    if (!member) {
      this.connections.delete(connectionId);
      this.connectionToSession.delete(connectionId);
      return null;
    }

    this.connections.delete(connectionId);
    this.connectionToSession.delete(connectionId);

    if (!this.state) {
      this.members = this.members.filter((candidate) => candidate.playerId !== member.playerId);
      if (member.isHost && this.members.length > 0) {
        this.members[0].isHost = true;
      }
    } else {
      member.isConnected = false;
      member.connectionId = null;
    }

    const payload = this.createLeftMessage(member.playerId);
    this.broadcast(payload);
    this.broadcastPlayers();
    return payload;
  }

  start(connectionId: string, mode: GameMode): RoomStartedMessage {
    if (this.state) {
      throw new Error("Match already started");
    }

    const member = this.getMemberByConnection(connectionId);
    if (!member) {
      throw new Error("Connection is not bound to a room member");
    }
    if (!member.isHost) {
      throw new Error("Only host can start the room");
    }
    if (this.members.length < 2) {
      throw new Error("Need at least 2 players to start");
    }

    this.mode = mode;
    this.state = startGame({
      matchId: `${this.id}-${Date.now()}`,
      mode,
      players: this.members.map((current) => ({
        id: current.playerId,
        name: current.name,
      })),
    });

    const payload: RoomStartedMessage = {
      type: "room.started",
      room: this.getSnapshot(),
      state: this.state,
    };
    this.broadcast(payload);
    return payload;
  }

  dispatch(connectionId: string, action: GameAction) {
    if (!this.state) {
      throw new Error("Match has not started");
    }

    const member = this.getMemberByConnection(connectionId);
    if (!member) {
      throw new Error("Connection is not bound to a player");
    }

    this.state = applyAction(this.state, bindActionToPlayer(action, member.playerId));
    this.broadcast(this.createStateMessage());
  }

  private createMember(user: TelegramUserIdentity, isHost: boolean): RoomMember {
    const sessionToken = createSessionToken();
    return {
      playerId: `player_${randomUUID().slice(0, 8)}`,
      telegramUserId: user.telegramUserId,
      name: normalizePlayerName(user.displayName),
      sessionToken,
      sessionTokenHash: hashRoomSessionToken(sessionToken),
      isHost,
      isConnected: false,
      connectionId: null,
    };
  }

  private bindConnection(member: RoomMember, connection: RoomConnection) {
    this.connections.set(connection.id, connection);
    this.connectionToSession.set(connection.id, this.requireSessionToken(member));
    member.connectionId = connection.id;
    member.isConnected = true;
  }

  private requireSessionToken(member: RoomMember) {
    if (!member.sessionToken) {
      throw new Error("Room member session token is missing");
    }

    return member.sessionToken;
  }

  private getMemberByConnection(connectionId: string) {
    const sessionToken = this.connectionToSession.get(connectionId);
    if (!sessionToken) {
      return undefined;
    }

    return this.members.find((member) => member.sessionToken === sessionToken);
  }

  private createStateMessage(): RoomStateMessage {
    if (!this.state) {
      throw new Error("Match state is not available");
    }

    return {
      type: "room.state",
      roomId: this.id,
      state: this.state,
    };
  }

  private createLeftMessage(playerId: string): RoomLeftMessage {
    return {
      type: "room.left",
      roomId: this.id,
      playerId,
    };
  }

  private broadcastPlayers() {
    const payload: RoomPlayersMessage = {
      type: "room.players",
      room: this.getSnapshot(),
    };
    this.broadcast(payload);
  }

  private broadcast(payload: ServerToClientMessage) {
    for (const member of this.members) {
      if (!member.connectionId) {
        continue;
      }

      const connection = this.connections.get(member.connectionId);
      connection?.send(payload);
    }
  }
}