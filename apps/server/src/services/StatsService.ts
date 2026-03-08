import type { GameMode } from "@durak/shared";
import type { StatsRepository } from "../persistence/contracts";

type RecordMatchStatsInput = {
  matchId: string;
  mode: GameMode;
  finishedAt: number;
  winnerUserIds: string[];
  loserUserId: string | null;
  participantUserIds: string[];
};

export class StatsService {
  constructor(
    private readonly stats: StatsRepository,
    private readonly initialRating = 1000
  ) {}

  recordMatchCompletion(input: RecordMatchStatsInput) {
    for (const userId of input.participantUserIds) {
      const current =
        this.stats.getUserStats(userId) ??
        {
          userId,
          matchesPlayed: 0,
          wins: 0,
          losses: 0,
          simpleMatches: 0,
          transferMatches: 0,
          lastMatchAt: null,
        };

      const next = {
        ...current,
        matchesPlayed: current.matchesPlayed + 1,
        wins: current.wins + (input.winnerUserIds.includes(userId) ? 1 : 0),
        losses: current.losses + (input.loserUserId === userId ? 1 : 0),
        simpleMatches: current.simpleMatches + (input.mode === "simple" ? 1 : 0),
        transferMatches: current.transferMatches + (input.mode === "transfer" ? 1 : 0),
        lastMatchAt: input.finishedAt,
      };
      this.stats.upsertUserStats(next);
    }

    for (const userId of input.participantUserIds) {
      const previous = this.stats.getRating(userId) ?? {
        userId,
        ratingValue: this.initialRating,
        updatedAt: input.finishedAt,
      };

      const delta = input.winnerUserIds.includes(userId)
        ? 10
        : input.loserUserId === userId
          ? -10
          : 0;
      const next = {
        userId,
        ratingValue: previous.ratingValue + delta,
        updatedAt: input.finishedAt,
      };

      this.stats.upsertRating(next);
      if (delta !== 0) {
        this.stats.appendRatingHistory({
          matchId: input.matchId,
          userId,
          oldRating: previous.ratingValue,
          newRating: next.ratingValue,
          delta,
        });
      }
    }
  }
}
