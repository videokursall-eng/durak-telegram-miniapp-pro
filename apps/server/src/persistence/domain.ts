import { createHash, randomUUID } from "node:crypto";
import type { GameMode, GameState, PlayerId } from "@durak/shared";
import type { TelegramUserIdentity, TrustedAuthSession } from "../auth/types.js";

export type DurableRoomStatus = "lobby" | "in_game" | "finished" | "abandoned";
export type DurableMatchStatus = "active" | "finished" | "abandoned";

export type PersistentUser = {
  id: string;
  telegramUserId: string;
  username: string | null;
  firstName: string | null;
  lastName: string | null;
  photoUrl: string | null;
  displayName: string;
  createdAt: number;
  lastSeenAt: number;
};

export type PersistentRoom = {
  id: string;
  roomCode: string;
  status: DurableRoomStatus;
  hostUserId: string;
  currentMatchId: string | null;
  createdAt: number;
  startedAt: number | null;
  closedAt: number | null;
};

export type PersistentRoomMembership = {
  id: string;
  roomId: string;
  userId: string;
  playerId: PlayerId;
  playerName: string;
  roomSessionTokenHash: string;
  isHost: boolean;
  joinOrder: number;
  joinedAt: number;
  leftAt: number | null;
  disconnectAt: number | null;
  reconnectedAt: number | null;
};

export type PersistentMatch = {
  id: string;
  roomId: string;
  mode: GameMode;
  status: DurableMatchStatus;
  startedAt: number;
  finishedAt: number | null;
  latestVersion: number;
  latestSnapshotId: string | null;
  loserUserId: string | null;
};

export type PersistentMatchPlayer = {
  id: string;
  matchId: string;
  userId: string;
  playerId: PlayerId;
  seatOrder: number;
  displayNameAtMatchStart: string;
  finishPlace: number | null;
  isLoser: boolean;
};

export type PersistentMatchSnapshot = {
  id: string;
  matchId: string;
  version: number;
  stateJson: GameState;
  createdAt: number;
};

export type PersistentMatchResult = {
  id: string;
  matchId: string;
  roomId: string;
  mode: GameMode;
  winnerUserIds: string[];
  loserUserId: string | null;
  durationSeconds: number;
  finishedAt: number;
};

export type PersistentUserStats = {
  userId: string;
  matchesPlayed: number;
  wins: number;
  losses: number;
  simpleMatches: number;
  transferMatches: number;
  lastMatchAt: number | null;
};

export type PersistentRating = {
  userId: string;
  ratingValue: number;
  updatedAt: number;
};

export type PersistentRatingHistory = {
  matchId: string;
  userId: string;
  oldRating: number;
  newRating: number;
  delta: number;
};

export type LiveRoomMemberState = {
  playerId: PlayerId;
  userId: string;
  telegramUserId: string;
  name: string;
  sessionTokenHash: string;
  isHost: boolean;
  isConnected: boolean;
  joinOrder: number;
};

export type LiveRoomState = {
  roomCode: string;
  roomId: string;
  status: DurableRoomStatus;
  hostUserId: string;
  currentMatchId: string | null;
  mode: GameMode | null;
  members: LiveRoomMemberState[];
  latestState: GameState | null;
  latestVersion: number;
  updatedAt: number;
};

export type LiveRoomSessionLink = {
  tokenHash: string;
  roomCode: string;
  roomId: string;
  matchId: string | null;
  playerId: PlayerId;
  userId: string;
  telegramUserId: string;
  expiresAt: number;
};

export type RuntimeRoomMember = {
  playerId: PlayerId;
  telegramUserId: string;
  name: string;
  sessionToken: string | null;
  sessionTokenHash: string;
  isHost: boolean;
  isConnected: boolean;
};

export type RuntimeRoomState = {
  roomCode: string;
  mode: GameMode | null;
  state: GameState | null;
  members: RuntimeRoomMember[];
};

export function createEntityId(prefix: string) {
  return `${prefix}_${randomUUID()}`;
}

export function hashRoomSessionToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function createPersistentUser(
  identity: TelegramUserIdentity,
  nowMs: number
): PersistentUser {
  return {
    id: createEntityId("user"),
    telegramUserId: identity.telegramUserId,
    username: identity.username,
    firstName: identity.firstName,
    lastName: identity.lastName,
    photoUrl: identity.photoUrl,
    displayName: identity.displayName,
    createdAt: nowMs,
    lastSeenAt: nowMs,
  };
}

export function toLiveAuthSession(session: TrustedAuthSession, userId: string) {
  return {
    token: session.token,
    userId,
    identity: session.user,
    issuedAt: session.issuedAt,
    expiresAt: session.expiresAt,
  };
}
