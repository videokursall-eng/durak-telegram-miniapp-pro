/**
 * Zustand store — client-side state machine for Durak PRO.
 *
 * Phase transitions:
 *
 *   idle
 *    └─ startAuth()      → auth         (POST /auth/telegram in flight)
 *         └─ setAuth()   → connecting   (WS connecting, token stored)
 *              └─ setReady()   → lobby       (connection.ready received)
 *                   └─ setGame()    → game
 *                        └─ setFinished() → finished
 *   any   └─ setError()  → error
 *
 * On WS disconnect the reconnect() action MUST be used — it resets to
 * 'connecting' while preserving the authToken and any in-progress game state.
 * It does NOT clear the token and does NOT go back to 'idle'/'auth'.
 */

import { create } from 'zustand';
import type { GameState } from '@durak/shared';

// ─── Types ─────────────────────────────────────────────────────────────────────

export type AppPhase =
  | 'idle'
  | 'auth'
  | 'connecting'
  | 'lobby'
  | 'game'
  | 'finished'
  | 'error';

export interface MatchResult {
  matchId: string;
  durakId: string;
  winners: string[];
  stats: Record<string, unknown>;
}

export interface RoomState {
  id: string;
  name: string;
  players: Array<{ id: string; name: string; isReady: boolean; isOwner: boolean }>;
  selfPlayerId: string;
}

export interface AppState {
  // ── Phase ──────────────────────────────────────────────────────────────────
  phase: AppPhase;

  // ── Auth ───────────────────────────────────────────────────────────────────
  /** JWT / session token returned by POST /auth/telegram. Never cleared on reconnect. */
  authToken: string | null;
  playerId: string | null;
  sessionId: string | null;

  // ── Room ───────────────────────────────────────────────────────────────────
  room: RoomState | null;

  // ── Game ───────────────────────────────────────────────────────────────────
  matchId: string | null;
  gameState: GameState | null;

  // ── Finished ───────────────────────────────────────────────────────────────
  matchResult: MatchResult | null;

  // ── Error ──────────────────────────────────────────────────────────────────
  errorMessage: string | null;

  // ── Actions ────────────────────────────────────────────────────────────────

  /** Called once at startup to begin the Telegram auth flow. */
  startAuth(): void;

  /**
   * Called after POST /auth/telegram succeeds.
   * Stores the token and advances to 'connecting'.
   */
  setAuth(token: string, playerId: string): void;

  /**
   * Called when the server sends connection.ready.
   * Advances to 'lobby' (or back to 'game' if we were mid-match).
   */
  setReady(playerId: string, sessionId: string): void;

  /** Called when room.joined is received. */
  setRoom(room: RoomState): void;

  /** Called when match.started or state.snapshot is received. */
  setGame(matchId: string, state: GameState): void;

  /** Called when a state.snapshot is received (in-game update). */
  updateGameState(state: GameState): void;

  /** Called when match.ended is received. */
  setFinished(result: MatchResult): void;

  /** Called on unrecoverable error. */
  setError(message: string): void;

  /**
   * Called on WS disconnect before scheduling a reconnect.
   *
   * ⚠️  This must NOT reset authToken, matchId, or gameState.
   * It only sets phase → 'connecting' so the WS client can retry
   * with the existing token.
   */
  reconnect(): void;

  /** Restart from scratch (e.g. user taps "play again"). */
  reset(): void;
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

const TOKEN_KEY = 'durak_auth_token';
const PLAYER_ID_KEY = 'durak_player_id';

function loadPersistedAuth(): { token: string | null; playerId: string | null } {
  try {
    return {
      token: localStorage.getItem(TOKEN_KEY),
      playerId: localStorage.getItem(PLAYER_ID_KEY),
    };
  } catch {
    return { token: null, playerId: null };
  }
}

function persistAuth(token: string, playerId: string): void {
  try {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(PLAYER_ID_KEY, playerId);
  } catch {
    // localStorage not available (e.g. private mode edge cases) — ignore
  }
}

function clearPersistedAuth(): void {
  try {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(PLAYER_ID_KEY);
  } catch {
    // ignore
  }
}

// ─── Store ─────────────────────────────────────────────────────────────────────

const { token: storedToken, playerId: storedPlayerId } = loadPersistedAuth();

export const useStore = create<AppState>((set, get) => ({
  // Initial state — if we have a persisted token, start in 'connecting' so
  // the WS client can immediately attempt to connect without re-authing.
  phase: storedToken ? 'connecting' : 'idle',
  authToken: storedToken,
  playerId: storedPlayerId,
  sessionId: null,
  room: null,
  matchId: null,
  gameState: null,
  matchResult: null,
  errorMessage: null,

  // ── Transitions ────────────────────────────────────────────────────────────

  startAuth() {
    if (get().phase !== 'idle') return;
    set({ phase: 'auth', errorMessage: null });
  },

  setAuth(token, playerId) {
    persistAuth(token, playerId);
    set({ phase: 'connecting', authToken: token, playerId, errorMessage: null });
  },

  setReady(playerId, sessionId) {
    const { phase, matchId, gameState } = get();
    // Only valid when connecting (initial or reconnect)
    if (phase !== 'connecting') return;

    // If we have an active (non-finished) match, stay in 'game' — the WS client
    // will send sync.state. If the match is already FINISHED or there's no match,
    // go to lobby.
    const isActiveMatch = matchId && gameState?.phase !== 'FINISHED';
    set({
      phase: isActiveMatch ? 'game' : 'lobby',
      playerId,
      sessionId,
      errorMessage: null,
    });
  },

  setRoom(room) {
    set({ room });
  },

  setGame(matchId, state) {
    set({ phase: 'game', matchId, gameState: state, errorMessage: null });
  },

  updateGameState(state) {
    set({ gameState: state });
  },

  setFinished(result) {
    set({ phase: 'finished', matchResult: result });
  },

  setError(message) {
    set({ phase: 'error', errorMessage: message });
  },

  reconnect() {
    const { authToken } = get();
    if (!authToken) {
      // No token at all — must redo full auth
      set({ phase: 'idle', errorMessage: null });
      return;
    }
    // ⚠️ CRITICAL: do NOT clear authToken, matchId, room, or gameState here.
    // Only signal that the WS connection needs to be re-established.
    set({ phase: 'connecting', sessionId: null, errorMessage: null });
  },

  reset() {
    clearPersistedAuth();
    set({
      phase: 'idle',
      authToken: null,
      playerId: null,
      sessionId: null,
      room: null,
      matchId: null,
      gameState: null,
      matchResult: null,
      errorMessage: null,
    });
  },
}));

// ─── Typed selectors ───────────────────────────────────────────────────────────

export const selectPhase = (s: AppState) => s.phase;
export const selectAuthToken = (s: AppState) => s.authToken;
export const selectPlayerId = (s: AppState) => s.playerId;
export const selectRoom = (s: AppState) => s.room;
export const selectGameState = (s: AppState) => s.gameState;
export const selectMatchResult = (s: AppState) => s.matchResult;
export const selectErrorMessage = (s: AppState) => s.errorMessage;
