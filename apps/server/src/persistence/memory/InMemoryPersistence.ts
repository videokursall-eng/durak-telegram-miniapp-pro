import type { GameMode, GameState, PlayerId } from "@durak/shared";
import type { TelegramUserIdentity } from "../../auth/types";
import type {
  LiveRoomStore,
  MatchPlayerRepository,
  MatchRepository,
  MatchResultRepository,
  PersistenceContainer,
  RoomMembershipRepository,
  RoomRepository,
  RoomSessionStore,
  SnapshotRepository,
  StatsRepository,
  UserRepository,
} from "../contracts";
import {
  createEntityId,
  createPersistentUser,
  type LiveRoomSessionLink,
  type LiveRoomState,
  type PersistentMatch,
  type PersistentMatchPlayer,
  type PersistentMatchResult,
  type PersistentMatchSnapshot,
  type PersistentRating,
  type PersistentRatingHistory,
  type PersistentRoom,
  type PersistentRoomMembership,
  type PersistentUser,
  type PersistentUserStats,
} from "../domain";

type Clock = () => number;

function cloneState(state: GameState): GameState {
  return structuredClone(state);
}

class InMemoryUserRepository implements UserRepository {
  private usersById = new Map<string, PersistentUser>();
  private userIdByTelegramUserId = new Map<string, string>();

  constructor(private readonly nowMs: Clock) {}

  upsertTelegramIdentity(identity: TelegramUserIdentity): PersistentUser {
    const existingId = this.userIdByTelegramUserId.get(identity.telegramUserId);
    if (!existingId) {
      const created = createPersistentUser(identity, this.nowMs());
      this.usersById.set(created.id, created);
      this.userIdByTelegramUserId.set(created.telegramUserId, created.id);
      return created;
    }

    const existing = this.usersById.get(existingId);
    if (!existing) {
      throw new Error("User repository is inconsistent");
    }

    const updated: PersistentUser = {
      ...existing,
      username: identity.username,
      firstName: identity.firstName,
      lastName: identity.lastName,
      photoUrl: identity.photoUrl,
      displayName: identity.displayName,
      lastSeenAt: this.nowMs(),
    };
    this.usersById.set(updated.id, updated);
    return updated;
  }

  getById(id: string) {
    return this.usersById.get(id) ?? null;
  }

  getByTelegramUserId(telegramUserId: string) {
    const id = this.userIdByTelegramUserId.get(telegramUserId);
    return id ? this.usersById.get(id) ?? null : null;
  }
}

class InMemoryRoomRepository implements RoomRepository {
  private roomsById = new Map<string, PersistentRoom>();
  private roomIdByCode = new Map<string, string>();

  constructor(private readonly nowMs: Clock) {}

  createRoom(input: { roomCode: string; hostUserId: string }): PersistentRoom {
    const room: PersistentRoom = {
      id: createEntityId("room"),
      roomCode: input.roomCode,
      status: "lobby",
      hostUserId: input.hostUserId,
      currentMatchId: null,
      createdAt: this.nowMs(),
      startedAt: null,
      closedAt: null,
    };
    this.roomsById.set(room.id, room);
    this.roomIdByCode.set(room.roomCode, room.id);
    return room;
  }

  getById(roomId: string) {
    return this.roomsById.get(roomId) ?? null;
  }

  getByRoomCode(roomCode: string) {
    const id = this.roomIdByCode.get(roomCode);
    return id ? this.roomsById.get(id) ?? null : null;
  }

  markRoomStarted(roomId: string, matchId: string, startedAt: number) {
    const room = this.requireRoom(roomId);
    const updated: PersistentRoom = {
      ...room,
      status: "in_game",
      currentMatchId: matchId,
      startedAt,
    };
    this.roomsById.set(roomId, updated);
    return updated;
  }

  markRoomFinished(roomId: string, closedAt: number) {
    const room = this.requireRoom(roomId);
    const updated: PersistentRoom = {
      ...room,
      status: "finished",
      closedAt,
    };
    this.roomsById.set(roomId, updated);
    return updated;
  }

  markRoomAbandoned(roomId: string, closedAt: number) {
    const room = this.requireRoom(roomId);
    const updated: PersistentRoom = {
      ...room,
      status: "abandoned",
      closedAt,
    };
    this.roomsById.set(roomId, updated);
    return updated;
  }

  private requireRoom(roomId: string) {
    const room = this.roomsById.get(roomId);
    if (!room) {
      throw new Error(`Room ${roomId} not found`);
    }
    return room;
  }
}

class InMemoryRoomMembershipRepository implements RoomMembershipRepository {
  private membershipsById = new Map<string, PersistentRoomMembership>();
  private membershipIdsByRoomId = new Map<string, string[]>();

  constructor(private readonly nowMs: Clock) {}

  createMembership(input: {
    roomId: string;
    userId: string;
    playerId: PlayerId;
    playerName: string;
    roomSessionTokenHash: string;
    isHost: boolean;
    joinOrder: number;
  }): PersistentRoomMembership {
    const membership: PersistentRoomMembership = {
      id: createEntityId("membership"),
      roomId: input.roomId,
      userId: input.userId,
      playerId: input.playerId,
      playerName: input.playerName,
      roomSessionTokenHash: input.roomSessionTokenHash,
      isHost: input.isHost,
      joinOrder: input.joinOrder,
      joinedAt: this.nowMs(),
      leftAt: null,
      disconnectAt: null,
      reconnectedAt: null,
    };
    this.membershipsById.set(membership.id, membership);
    this.membershipIdsByRoomId.set(input.roomId, [
      ...(this.membershipIdsByRoomId.get(input.roomId) ?? []),
      membership.id,
    ]);
    return membership;
  }

  listByRoomId(roomId: string) {
    const ids = this.membershipIdsByRoomId.get(roomId) ?? [];
    return ids
      .map((id) => this.membershipsById.get(id))
      .filter((membership): membership is PersistentRoomMembership => Boolean(membership))
      .sort((a, b) => a.joinOrder - b.joinOrder);
  }

  getByRoomIdAndPlayerId(roomId: string, playerId: PlayerId) {
    return this.listByRoomId(roomId).find((membership) => membership.playerId === playerId) ?? null;
  }

  getByRoomIdAndSessionTokenHash(roomId: string, sessionTokenHash: string) {
    return (
      this.listByRoomId(roomId).find(
        (membership) => membership.roomSessionTokenHash === sessionTokenHash
      ) ?? null
    );
  }

  markDisconnected(roomId: string, playerId: PlayerId, atMs: number) {
    return this.update(roomId, playerId, (membership) => ({
      ...membership,
      disconnectAt: atMs,
    }));
  }

  markReconnected(roomId: string, playerId: PlayerId, atMs: number) {
    return this.update(roomId, playerId, (membership) => ({
      ...membership,
      disconnectAt: null,
      reconnectedAt: atMs,
    }));
  }

  markLeft(roomId: string, playerId: PlayerId, atMs: number) {
    return this.update(roomId, playerId, (membership) => ({
      ...membership,
      leftAt: atMs,
    }));
  }

  private update(
    roomId: string,
    playerId: PlayerId,
    updater: (membership: PersistentRoomMembership) => PersistentRoomMembership
  ) {
    const membership = this.getByRoomIdAndPlayerId(roomId, playerId);
    if (!membership) {
      return null;
    }
    const updated = updater(membership);
    this.membershipsById.set(updated.id, updated);
    return updated;
  }
}

class InMemoryMatchRepository implements MatchRepository {
  private matchesById = new Map<string, PersistentMatch>();

  createMatch(input: { id: string; roomId: string; mode: GameMode; startedAt: number }): PersistentMatch {
    const match: PersistentMatch = {
      id: input.id,
      roomId: input.roomId,
      mode: input.mode,
      status: "active",
      startedAt: input.startedAt,
      finishedAt: null,
      latestVersion: 0,
      latestSnapshotId: null,
      loserUserId: null,
    };
    this.matchesById.set(match.id, match);
    return match;
  }

  getById(matchId: string) {
    return this.matchesById.get(matchId) ?? null;
  }

  getActiveByRoomId(roomId: string) {
    return (
      [...this.matchesById.values()]
        .filter((match) => match.roomId === roomId && match.status === "active")
        .sort((a, b) => b.startedAt - a.startedAt)[0] ?? null
    );
  }

  updateLatestSnapshot(matchId: string, version: number, snapshotId: string) {
    const match = this.requireMatch(matchId);
    const updated: PersistentMatch = {
      ...match,
      latestVersion: version,
      latestSnapshotId: snapshotId,
    };
    this.matchesById.set(matchId, updated);
    return updated;
  }

  finishMatch(input: {
    matchId: string;
    finishedAt: number;
    loserUserId: string | null;
    status: PersistentMatch["status"];
  }) {
    const match = this.requireMatch(input.matchId);
    const updated: PersistentMatch = {
      ...match,
      status: input.status,
      finishedAt: input.finishedAt,
      loserUserId: input.loserUserId,
    };
    this.matchesById.set(input.matchId, updated);
    return updated;
  }

  private requireMatch(matchId: string) {
    const match = this.matchesById.get(matchId);
    if (!match) {
      throw new Error(`Match ${matchId} not found`);
    }
    return match;
  }
}

class InMemoryMatchPlayerRepository implements MatchPlayerRepository {
  private playersById = new Map<string, PersistentMatchPlayer>();

  createMany(players: Array<Omit<PersistentMatchPlayer, "id">>) {
    return players.map((player) => {
      const created: PersistentMatchPlayer = {
        ...player,
        id: createEntityId("match_player"),
      };
      this.playersById.set(created.id, created);
      return created;
    });
  }

  listByMatchId(matchId: string) {
    return [...this.playersById.values()]
      .filter((player) => player.matchId === matchId)
      .sort((a, b) => a.seatOrder - b.seatOrder);
  }
}

class InMemorySnapshotRepository implements SnapshotRepository {
  private snapshotsById = new Map<string, PersistentMatchSnapshot>();

  appendSnapshot(input: {
    matchId: string;
    version: number;
    stateJson: GameState;
    createdAt: number;
  }) {
    const existing = this.getByMatchIdAndVersion(input.matchId, input.version);
    if (existing) {
      return existing;
    }

    const snapshot: PersistentMatchSnapshot = {
      id: createEntityId("snapshot"),
      matchId: input.matchId,
      version: input.version,
      stateJson: cloneState(input.stateJson),
      createdAt: input.createdAt,
    };
    this.snapshotsById.set(snapshot.id, snapshot);
    return snapshot;
  }

  getLatestByMatchId(matchId: string) {
    return (
      [...this.snapshotsById.values()]
        .filter((snapshot) => snapshot.matchId === matchId)
        .sort((a, b) => b.version - a.version)[0] ?? null
    );
  }

  getByMatchIdAndVersion(matchId: string, version: number) {
    return (
      [...this.snapshotsById.values()].find(
        (snapshot) => snapshot.matchId === matchId && snapshot.version === version
      ) ?? null
    );
  }
}

class InMemoryMatchResultRepository implements MatchResultRepository {
  private resultsById = new Map<string, PersistentMatchResult>();
  private resultIdByMatchId = new Map<string, string>();

  createResult(input: Omit<PersistentMatchResult, "id">) {
    const existingId = this.resultIdByMatchId.get(input.matchId);
    if (existingId) {
      return this.resultsById.get(existingId)!;
    }

    const result: PersistentMatchResult = {
      ...input,
      id: createEntityId("match_result"),
    };
    this.resultsById.set(result.id, result);
    this.resultIdByMatchId.set(result.matchId, result.id);
    return result;
  }

  getByMatchId(matchId: string) {
    const id = this.resultIdByMatchId.get(matchId);
    return id ? this.resultsById.get(id) ?? null : null;
  }
}

class InMemoryStatsRepository implements StatsRepository {
  private statsByUserId = new Map<string, PersistentUserStats>();
  private ratingsByUserId = new Map<string, PersistentRating>();
  private ratingHistoryByMatchId = new Map<string, PersistentRatingHistory[]>();

  getUserStats(userId: string) {
    return this.statsByUserId.get(userId) ?? null;
  }

  upsertUserStats(input: PersistentUserStats) {
    this.statsByUserId.set(input.userId, input);
    return input;
  }

  getRating(userId: string) {
    return this.ratingsByUserId.get(userId) ?? null;
  }

  upsertRating(input: PersistentRating) {
    this.ratingsByUserId.set(input.userId, input);
    return input;
  }

  appendRatingHistory(input: PersistentRatingHistory) {
    const history = this.ratingHistoryByMatchId.get(input.matchId) ?? [];
    history.push(input);
    this.ratingHistoryByMatchId.set(input.matchId, history);
    return input;
  }

  listRatingHistoryByMatchId(matchId: string) {
    return [...(this.ratingHistoryByMatchId.get(matchId) ?? [])];
  }
}

class InMemoryLiveRoomStore implements LiveRoomStore {
  private rooms = new Map<string, LiveRoomState>();

  save(room: LiveRoomState) {
    this.rooms.set(room.roomCode, {
      ...room,
      members: room.members.map((member) => ({ ...member })),
      latestState: room.latestState ? cloneState(room.latestState) : null,
    });
  }

  get(roomCode: string) {
    const room = this.rooms.get(roomCode);
    if (!room) {
      return null;
    }

    return {
      ...room,
      members: room.members.map((member) => ({ ...member })),
      latestState: room.latestState ? cloneState(room.latestState) : null,
    };
  }

  delete(roomCode: string) {
    this.rooms.delete(roomCode);
  }
}

class InMemoryRoomSessionStore implements RoomSessionStore {
  private linksByTokenHash = new Map<string, LiveRoomSessionLink>();

  save(link: LiveRoomSessionLink) {
    this.linksByTokenHash.set(link.tokenHash, { ...link });
  }

  get(tokenHash: string) {
    const link = this.linksByTokenHash.get(tokenHash);
    return link ? { ...link } : null;
  }

  delete(tokenHash: string) {
    this.linksByTokenHash.delete(tokenHash);
  }

  listByRoomCode(roomCode: string) {
    return [...this.linksByTokenHash.values()]
      .filter((link) => link.roomCode === roomCode)
      .map((link) => ({ ...link }));
  }
}

export function createInMemoryPersistence(nowMs: Clock = () => Date.now()): PersistenceContainer {
  return {
    users: new InMemoryUserRepository(nowMs),
    rooms: new InMemoryRoomRepository(nowMs),
    roomMemberships: new InMemoryRoomMembershipRepository(nowMs),
    matches: new InMemoryMatchRepository(),
    matchPlayers: new InMemoryMatchPlayerRepository(),
    snapshots: new InMemorySnapshotRepository(),
    matchResults: new InMemoryMatchResultRepository(),
    stats: new InMemoryStatsRepository(),
    liveRooms: new InMemoryLiveRoomStore(),
    roomSessions: new InMemoryRoomSessionStore(),
  };
}
