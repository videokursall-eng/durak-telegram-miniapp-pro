import type { GameMode, GameState } from "@durak/shared";
import type { PersistenceContainer } from "../persistence/contracts";
import type { RuntimeRoomState } from "../persistence/domain";
import { RoomLifecycleService } from "./RoomLifecycleService";

type ReconnectServiceOptions = {
  nowMs?: () => number;
};

export class ReconnectService {
  private readonly nowMs: () => number;

  constructor(
    private readonly persistence: PersistenceContainer,
    private readonly roomLifecycle: RoomLifecycleService,
    options: ReconnectServiceOptions = {}
  ) {
    this.nowMs = options.nowMs ?? (() => Date.now());
  }

  recoverRoomRuntime(roomCode: string, sessionToken: string, telegramUserId: string): RuntimeRoomState | null {
    const validated = this.roomLifecycle.validateRoomSession(roomCode, sessionToken, telegramUserId);
    if (!validated) {
      return null;
    }

    this.persistence.roomSessions.save({
      ...validated,
      expiresAt: this.nowMs() + 1000 * 60 * 60 * 24,
    });

    const liveRoom = this.persistence.liveRooms.get(roomCode);
    if (liveRoom) {
      return {
        roomCode,
        mode: liveRoom.mode,
        state: liveRoom.latestState,
        members: liveRoom.members.map((member) => ({
          playerId: member.playerId,
          telegramUserId: member.telegramUserId,
          name: member.name,
          sessionToken: null,
          sessionTokenHash: member.sessionTokenHash,
          isHost: member.isHost,
          isConnected: member.playerId === validated.playerId ? true : member.isConnected,
        })),
      };
    }

    const room = this.persistence.rooms.getByRoomCode(roomCode);
    if (!room) {
      return null;
    }

    const match = room.currentMatchId ? this.persistence.matches.getById(room.currentMatchId) : null;
    const latestSnapshot = match ? this.persistence.snapshots.getLatestByMatchId(match.id) : null;
    const matchPlayers = match ? this.persistence.matchPlayers.listByMatchId(match.id) : [];
    const memberships = this.persistence.roomMemberships.listByRoomId(room.id);

    const members = memberships
      .filter((membership) => membership.leftAt === null)
      .map((membership) => {
        const user = this.persistence.users.getById(membership.userId);
        const matchPlayer = matchPlayers.find((player) => player.playerId === membership.playerId);
        return {
          playerId: membership.playerId,
          telegramUserId: user?.telegramUserId ?? "",
          name: matchPlayer?.displayNameAtMatchStart ?? membership.playerName,
          sessionToken: null,
          sessionTokenHash: membership.roomSessionTokenHash,
          isHost: membership.isHost,
          isConnected: membership.playerId === validated.playerId,
        };
      });

    return {
      roomCode,
      mode: (latestSnapshot?.stateJson.mode ?? match?.mode ?? null) as GameMode | null,
      state: (latestSnapshot?.stateJson ?? null) as GameState | null,
      members,
    };
  }
}
