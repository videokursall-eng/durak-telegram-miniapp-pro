import type { TelegramUserIdentity } from "../auth/types.js";
import type { PersistenceContainer } from "../persistence/contracts.js";
import {
  hashRoomSessionToken,
  type RuntimeRoomMember,
  type RuntimeRoomState,
} from "../persistence/domain.js";
import { MatchPersistenceService } from "./MatchPersistenceService.js";

type RoomLifecycleServiceOptions = {
  nowMs?: () => number;
  roomSessionTtlMs?: number;
};

export class RoomLifecycleService {
  private readonly nowMs: () => number;
  private readonly roomSessionTtlMs: number;
  private readonly matchPersistence: MatchPersistenceService;

  constructor(
    private readonly persistence: PersistenceContainer,
    options: RoomLifecycleServiceOptions = {}
  ) {
    this.nowMs = options.nowMs ?? (() => Date.now());
    this.roomSessionTtlMs = options.roomSessionTtlMs ?? 1000 * 60 * 60 * 24;
    this.matchPersistence = new MatchPersistenceService(this.persistence, {
      nowMs: this.nowMs,
    });
  }

  upsertAuthenticatedUser(identity: TelegramUserIdentity) {
    return this.persistence.users.upsertTelegramIdentity(identity);
  }

  recordRoomCreated(runtime: RuntimeRoomState, hostIdentity: TelegramUserIdentity) {
    const hostUser = this.upsertAuthenticatedUser(hostIdentity);
    const room = this.persistence.rooms.createRoom({
      roomCode: runtime.roomCode,
      hostUserId: hostUser.id,
    });
    const hostMember = runtime.members.find((member) => member.telegramUserId === hostIdentity.telegramUserId);
    if (!hostMember) {
      throw new Error("Host member is missing from room runtime");
    }

    this.createMembership(room.id, hostMember, 0);
    this.syncLiveRoom(runtime, room.id, hostUser.id);
  }

  recordPlayerJoined(runtime: RuntimeRoomState, identity: TelegramUserIdentity) {
    const user = this.upsertAuthenticatedUser(identity);
    const room = this.requireRoom(runtime.roomCode);
    const member = runtime.members.find((candidate) => candidate.telegramUserId === identity.telegramUserId);
    if (!member) {
      throw new Error("Joined member is missing from runtime state");
    }

    if (!this.persistence.roomMemberships.getByRoomIdAndPlayerId(room.id, member.playerId)) {
      this.createMembership(room.id, member, runtime.members.findIndex((entry) => entry.playerId === member.playerId), user.id);
    }
    this.syncLiveRoom(runtime, room.id, room.hostUserId);
  }

  recordPlayerDisconnected(runtime: RuntimeRoomState, playerId: string) {
    const room = this.requireRoom(runtime.roomCode);
    this.persistence.roomMemberships.markDisconnected(room.id, playerId, this.nowMs());
    this.syncLiveRoom(runtime, room.id, room.hostUserId);
  }

  recordPlayerReconnected(runtime: RuntimeRoomState, playerId: string) {
    const room = this.requireRoom(runtime.roomCode);
    this.persistence.roomMemberships.markReconnected(room.id, playerId, this.nowMs());
    this.syncLiveRoom(runtime, room.id, room.hostUserId);
  }

  recordPlayerLeftLobby(runtime: RuntimeRoomState, playerId: string) {
    const room = this.requireRoom(runtime.roomCode);
    const membership = this.persistence.roomMemberships.markLeft(room.id, playerId, this.nowMs());
    if (membership) {
      this.persistence.roomSessions.delete(membership.roomSessionTokenHash);
    }

    if (runtime.members.length === 0) {
      this.persistence.rooms.markRoomAbandoned(room.id, this.nowMs());
      this.persistence.liveRooms.delete(runtime.roomCode);
      return;
    }

    this.syncLiveRoom(runtime, room.id, room.hostUserId);
  }

  recordMatchStarted(runtime: RuntimeRoomState) {
    const room = this.requireRoom(runtime.roomCode);
    this.syncLiveRoom(runtime, room.id, room.hostUserId);
    this.matchPersistence.recordMatchStarted(runtime);
    this.syncLiveRoom(runtime, room.id, room.hostUserId);
  }

  recordStateAdvanced(runtime: RuntimeRoomState) {
    const room = this.requireRoom(runtime.roomCode);
    this.syncLiveRoom(runtime, room.id, room.hostUserId);
    this.matchPersistence.recordStateAdvanced(runtime);
    const updatedRoom = this.requireRoom(runtime.roomCode);
    this.syncLiveRoom(runtime, updatedRoom.id, updatedRoom.hostUserId);
  }

  private createMembership(
    roomId: string,
    member: RuntimeRoomMember,
    joinOrder: number,
    userId?: string
  ) {
    const user =
      userId != null
        ? this.persistence.users.getById(userId)
        : this.persistence.users.getByTelegramUserId(member.telegramUserId);
    if (!user) {
      throw new Error(`User ${member.telegramUserId} is not persisted`);
    }

    return this.persistence.roomMemberships.createMembership({
      roomId,
      userId: user.id,
      playerId: member.playerId,
      playerName: member.name,
      roomSessionTokenHash: member.sessionTokenHash,
      isHost: member.isHost,
      joinOrder,
    });
  }

  private syncLiveRoom(runtime: RuntimeRoomState, roomId: string, hostUserId: string) {
    const room = this.persistence.rooms.getById(roomId);
    this.persistence.liveRooms.save({
      roomCode: runtime.roomCode,
      roomId,
      status: room?.status ?? (runtime.state ? "in_game" : "lobby"),
      hostUserId,
      currentMatchId: runtime.state?.matchId ?? room?.currentMatchId ?? null,
      mode: runtime.mode,
      members: runtime.members.map((member, index) => ({
        playerId: member.playerId,
        userId: this.requireUserId(member.telegramUserId),
        telegramUserId: member.telegramUserId,
        name: member.name,
        sessionTokenHash: member.sessionTokenHash,
        isHost: member.isHost,
        isConnected: member.isConnected,
        joinOrder: index,
      })),
      latestState: runtime.state,
      latestVersion: runtime.state?.version ?? 0,
      updatedAt: this.nowMs(),
    });

    for (const member of runtime.members) {
      this.persistence.roomSessions.save({
        tokenHash: member.sessionTokenHash,
        roomCode: runtime.roomCode,
        roomId,
        matchId: runtime.state?.matchId ?? room?.currentMatchId ?? null,
        playerId: member.playerId,
        userId: this.requireUserId(member.telegramUserId),
        telegramUserId: member.telegramUserId,
        expiresAt: this.nowMs() + this.roomSessionTtlMs,
      });
    }
  }

  validateRoomSession(roomCode: string, sessionToken: string, telegramUserId: string) {
    const tokenHash = hashRoomSessionToken(sessionToken);
    const live = this.persistence.roomSessions.get(tokenHash);
    if (live) {
      return live.roomCode === roomCode && live.telegramUserId === telegramUserId ? live : null;
    }

    const room = this.persistence.rooms.getByRoomCode(roomCode);
    if (!room) {
      return null;
    }
    const membership = this.persistence.roomMemberships.getByRoomIdAndSessionTokenHash(room.id, tokenHash);
    if (!membership) {
      return null;
    }
    const user = this.persistence.users.getById(membership.userId);
    if (!user || user.telegramUserId !== telegramUserId) {
      return null;
    }

    return {
      tokenHash,
      roomCode,
      roomId: room.id,
      matchId: room.currentMatchId,
      playerId: membership.playerId,
      userId: membership.userId,
      telegramUserId,
      expiresAt: this.nowMs() + this.roomSessionTtlMs,
    };
  }

  private requireRoom(roomCode: string) {
    const room = this.persistence.rooms.getByRoomCode(roomCode);
    if (!room) {
      throw new Error(`Room ${roomCode} is not persisted`);
    }
    return room;
  }

  private requireUserId(telegramUserId: string) {
    const user = this.persistence.users.getByTelegramUserId(telegramUserId);
    if (!user) {
      throw new Error(`User ${telegramUserId} is not persisted`);
    }
    return user.id;
  }
}
