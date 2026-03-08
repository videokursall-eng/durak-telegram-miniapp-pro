import type { GameState } from "@durak/shared";
import type { PersistenceContainer } from "../persistence/contracts.js";
import type { RuntimeRoomState } from "../persistence/domain.js";
import { StatsService } from "./StatsService.js";

type MatchPersistenceServiceOptions = {
  nowMs?: () => number;
};

export class MatchPersistenceService {
  private readonly nowMs: () => number;
  private readonly statsService: StatsService;

  constructor(
    private readonly persistence: PersistenceContainer,
    options: MatchPersistenceServiceOptions = {}
  ) {
    this.nowMs = options.nowMs ?? (() => Date.now());
    this.statsService = new StatsService(this.persistence.stats);
  }

  recordMatchStarted(runtime: RuntimeRoomState) {
    if (!runtime.state) {
      throw new Error("Cannot persist a match without state");
    }

    const room = this.requireRoom(runtime.roomCode);
    const startedAt = this.nowMs();
    const match = this.persistence.matches.createMatch({
      id: runtime.state.matchId,
      roomId: room.id,
      mode: runtime.state.mode,
      startedAt,
    });

    const memberships = this.persistence.roomMemberships.listByRoomId(room.id);
    this.persistence.matchPlayers.createMany(
      runtime.members.map((member, seatOrder) => {
        const membership = memberships.find((candidate) => candidate.playerId === member.playerId);
        if (!membership) {
          throw new Error(`Missing membership for player ${member.playerId}`);
        }
        return {
          matchId: match.id,
          userId: membership.userId,
          playerId: member.playerId,
          seatOrder,
          displayNameAtMatchStart: member.name,
          finishPlace: null,
          isLoser: false,
        };
      })
    );

    const snapshot = this.persistence.snapshots.appendSnapshot({
      matchId: match.id,
      version: runtime.state.version,
      stateJson: runtime.state,
      createdAt: startedAt,
    });
    this.persistence.matches.updateLatestSnapshot(match.id, runtime.state.version, snapshot.id);
    this.persistence.rooms.markRoomStarted(room.id, match.id, startedAt);
  }

  recordStateAdvanced(runtime: RuntimeRoomState) {
    if (!runtime.state) {
      return;
    }

    const room = this.requireRoom(runtime.roomCode);
    const match = this.persistence.matches.getById(runtime.state.matchId);
    if (!match) {
      this.recordMatchStarted(runtime);
      return;
    }

    const latestSnapshot = this.persistence.snapshots.getLatestByMatchId(match.id);
    if (!latestSnapshot || latestSnapshot.version < runtime.state.version) {
      const createdAt = this.nowMs();
      const snapshot = this.persistence.snapshots.appendSnapshot({
        matchId: match.id,
        version: runtime.state.version,
        stateJson: runtime.state,
        createdAt,
      });
      this.persistence.matches.updateLatestSnapshot(match.id, runtime.state.version, snapshot.id);
    }

    if (runtime.state.phase === "finished") {
      this.finishMatch(room.id, runtime.state);
    }
  }

  private finishMatch(roomId: string, state: GameState) {
    const room = this.requireRoomById(roomId);
    const match = this.persistence.matches.getById(state.matchId);
    if (!match || match.status !== "active") {
      return;
    }

    const finishedAt = this.nowMs();
    const participants = this.persistence.matchPlayers.listByMatchId(match.id);
    const loserMatchPlayer = participants.find((player) => player.playerId === state.loserId) ?? null;
    const winnerUserIds = participants
      .filter((player) => state.winnerIds.includes(player.playerId))
      .map((player) => player.userId);

    this.persistence.matches.finishMatch({
      matchId: match.id,
      finishedAt,
      loserUserId: loserMatchPlayer?.userId ?? null,
      status: "finished",
    });

    this.persistence.matchResults.createResult({
      matchId: match.id,
      roomId: room.id,
      mode: match.mode,
      winnerUserIds,
      loserUserId: loserMatchPlayer?.userId ?? null,
      durationSeconds: Math.max(0, Math.floor((finishedAt - match.startedAt) / 1000)),
      finishedAt,
    });

    this.statsService.recordMatchCompletion({
      matchId: match.id,
      mode: match.mode,
      finishedAt,
      winnerUserIds,
      loserUserId: loserMatchPlayer?.userId ?? null,
      participantUserIds: participants.map((player) => player.userId),
    });

    this.persistence.rooms.markRoomFinished(room.id, finishedAt);
  }

  private requireRoom(roomCode: string) {
    const room = this.persistence.rooms.getByRoomCode(roomCode);
    if (!room) {
      throw new Error(`Room ${roomCode} is not persisted`);
    }
    return room;
  }

  private requireRoomById(roomId: string) {
    const room = this.persistence.rooms.getById(roomId);
    if (!room) {
      throw new Error(`Room ${roomId} is not persisted`);
    }
    return room;
  }
}
