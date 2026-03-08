import type { GameMode, GameState, PlayerId } from "@durak/shared";
import type { TelegramUserIdentity } from "../auth/types";
import type {
  LiveRoomSessionLink,
  LiveRoomState,
  PersistentMatch,
  PersistentMatchPlayer,
  PersistentMatchResult,
  PersistentMatchSnapshot,
  PersistentRating,
  PersistentRatingHistory,
  PersistentRoom,
  PersistentRoomMembership,
  PersistentUser,
  PersistentUserStats,
} from "./domain";

export type UserRepository = {
  upsertTelegramIdentity(identity: TelegramUserIdentity): PersistentUser;
  getById(id: string): PersistentUser | null;
  getByTelegramUserId(telegramUserId: string): PersistentUser | null;
};

export type RoomRepository = {
  createRoom(input: {
    roomCode: string;
    hostUserId: string;
  }): PersistentRoom;
  getById(roomId: string): PersistentRoom | null;
  getByRoomCode(roomCode: string): PersistentRoom | null;
  markRoomStarted(roomId: string, matchId: string, startedAt: number): PersistentRoom;
  markRoomFinished(roomId: string, closedAt: number): PersistentRoom;
  markRoomAbandoned(roomId: string, closedAt: number): PersistentRoom;
};

export type RoomMembershipRepository = {
  createMembership(input: {
    roomId: string;
    userId: string;
    playerId: PlayerId;
    playerName: string;
    roomSessionTokenHash: string;
    isHost: boolean;
    joinOrder: number;
  }): PersistentRoomMembership;
  listByRoomId(roomId: string): PersistentRoomMembership[];
  getByRoomIdAndPlayerId(roomId: string, playerId: PlayerId): PersistentRoomMembership | null;
  getByRoomIdAndSessionTokenHash(
    roomId: string,
    sessionTokenHash: string
  ): PersistentRoomMembership | null;
  markDisconnected(roomId: string, playerId: PlayerId, atMs: number): PersistentRoomMembership | null;
  markReconnected(roomId: string, playerId: PlayerId, atMs: number): PersistentRoomMembership | null;
  markLeft(roomId: string, playerId: PlayerId, atMs: number): PersistentRoomMembership | null;
};

export type MatchRepository = {
  createMatch(input: {
    id: string;
    roomId: string;
    mode: GameMode;
    startedAt: number;
  }): PersistentMatch;
  getById(matchId: string): PersistentMatch | null;
  getActiveByRoomId(roomId: string): PersistentMatch | null;
  updateLatestSnapshot(matchId: string, version: number, snapshotId: string): PersistentMatch;
  finishMatch(input: {
    matchId: string;
    finishedAt: number;
    loserUserId: string | null;
    status: PersistentMatch["status"];
  }): PersistentMatch;
};

export type MatchPlayerRepository = {
  createMany(players: Array<Omit<PersistentMatchPlayer, "id">>): PersistentMatchPlayer[];
  listByMatchId(matchId: string): PersistentMatchPlayer[];
};

export type SnapshotRepository = {
  appendSnapshot(input: {
    matchId: string;
    version: number;
    stateJson: GameState;
    createdAt: number;
  }): PersistentMatchSnapshot;
  getLatestByMatchId(matchId: string): PersistentMatchSnapshot | null;
  getByMatchIdAndVersion(matchId: string, version: number): PersistentMatchSnapshot | null;
};

export type MatchResultRepository = {
  createResult(input: Omit<PersistentMatchResult, "id">): PersistentMatchResult;
  getByMatchId(matchId: string): PersistentMatchResult | null;
};

export type StatsRepository = {
  getUserStats(userId: string): PersistentUserStats | null;
  upsertUserStats(input: PersistentUserStats): PersistentUserStats;
  getRating(userId: string): PersistentRating | null;
  upsertRating(input: PersistentRating): PersistentRating;
  appendRatingHistory(input: PersistentRatingHistory): PersistentRatingHistory;
  listRatingHistoryByMatchId(matchId: string): PersistentRatingHistory[];
};

export type LiveRoomStore = {
  save(room: LiveRoomState): void;
  get(roomCode: string): LiveRoomState | null;
  delete(roomCode: string): void;
};

export type RoomSessionStore = {
  save(link: LiveRoomSessionLink): void;
  get(tokenHash: string): LiveRoomSessionLink | null;
  delete(tokenHash: string): void;
  listByRoomCode(roomCode: string): LiveRoomSessionLink[];
};

export type PersistenceContainer = {
  users: UserRepository;
  rooms: RoomRepository;
  roomMemberships: RoomMembershipRepository;
  matches: MatchRepository;
  matchPlayers: MatchPlayerRepository;
  snapshots: SnapshotRepository;
  matchResults: MatchResultRepository;
  stats: StatsRepository;
  liveRooms: LiveRoomStore;
  roomSessions: RoomSessionStore;
};
