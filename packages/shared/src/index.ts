// ─── Card types ────────────────────────────────────────────────────────────────

export type Suit = 'S' | 'H' | 'D' | 'C';
export type Rank = '6' | '7' | '8' | '9' | 'T' | 'J' | 'Q' | 'K' | 'A';

/** e.g. "AS", "TD", "6H" */
export type CardId = string;

export interface Card {
  id: CardId;
  rank: Rank;
  suit: Suit;
}

// ─── Game state (server-authoritative) ────────────────────────────────────────

export type GamePhase =
  | 'LOBBY'
  | 'STARTING'
  | 'TRICK_ATTACK'
  | 'TRICK_DEFENSE'
  | 'TRICK_THROW_IN'
  | 'TRICK_RESOLUTION'
  | 'REFILL'
  | 'NEXT_TRICK'
  | 'FINISHED';

export type GameMode = 'simple' | 'transfer';

export interface TableSlot {
  attack: CardId;
  defense?: CardId;
}

export interface PlayerState {
  id: string;
  name: string;
  cardCount: number;
  /** Cards are visible only for the local player (sent by server per-player). */
  cards?: CardId[];
  isConnected: boolean;
  isReady: boolean;
}

export interface GameState {
  matchId: string;
  version: number;
  phase: GamePhase;
  mode: GameMode;
  trump: Suit;
  trumpCard?: CardId;
  deckCount: number;
  table: TableSlot[];
  players: PlayerState[];
  attackerIndex: number;
  defenderIndex: number;
  currentTurnPlayerId: string;
  discardCount: number;
  /** Durak (loser) playerId once game is FINISHED */
  durakId?: string;
}

// ─── Room types ────────────────────────────────────────────────────────────────

export interface RoomInfo {
  id: string;
  name: string;
  mode: GameMode;
  maxPlayers: number;
  playerCount: number;
  isOpen: boolean;
}

export interface RoomPlayer {
  id: string;
  name: string;
  isReady: boolean;
  isOwner: boolean;
}

// ─── Client → Server messages ─────────────────────────────────────────────────

export interface ClientMsgBase {
  type: string;
  actionId: string;
  matchId?: string;
}

export interface MsgRoomJoin extends ClientMsgBase {
  type: 'room.join';
  payload: { roomId: string; authToken: string };
}

export interface MsgRoomStart extends ClientMsgBase {
  type: 'room.start';
  payload: { mode: GameMode; maxPlayers: number };
}

export interface MsgSyncState extends ClientMsgBase {
  type: 'sync.state';
  payload: { matchId: string; knownStateVersion: number };
}

export interface MsgTurnAttack extends ClientMsgBase {
  type: 'turn.attack';
  payload: { cards: CardId[] };
}

export interface MsgTurnDefend extends ClientMsgBase {
  type: 'turn.defend';
  payload: { pairIndex: number; card: CardId };
}

export interface MsgTurnThrowIn extends ClientMsgBase {
  type: 'turn.throwIn';
  payload: { cards: CardId[] };
}

export interface MsgTurnTransfer extends ClientMsgBase {
  type: 'turn.transfer';
  payload: { card: CardId };
}

export interface MsgTurnTake extends ClientMsgBase {
  type: 'turn.take';
  payload: Record<string, never>;
}

export interface MsgTurnBeat extends ClientMsgBase {
  type: 'turn.beat';
  payload: Record<string, never>;
}

export interface MsgTurnPass extends ClientMsgBase {
  type: 'turn.pass';
  payload: Record<string, never>;
}

export type ClientMsg =
  | MsgRoomJoin
  | MsgRoomStart
  | MsgSyncState
  | MsgTurnAttack
  | MsgTurnDefend
  | MsgTurnThrowIn
  | MsgTurnTransfer
  | MsgTurnTake
  | MsgTurnBeat
  | MsgTurnPass;

// ─── Server → Client messages ─────────────────────────────────────────────────

export interface ServerMsgBase {
  type: string;
}

/** Sent immediately after WS auth succeeds. Client must handle this to advance state. */
export interface MsgConnectionReady extends ServerMsgBase {
  type: 'connection.ready';
  payload: { playerId: string; sessionId: string };
}

export interface MsgRoomJoined extends ServerMsgBase {
  type: 'room.joined';
  payload: { room: RoomInfo; selfPlayerId: string };
}

export interface MsgRoomPlayers extends ServerMsgBase {
  type: 'room.players';
  payload: { players: RoomPlayer[] };
}

export interface MsgMatchStarted extends ServerMsgBase {
  type: 'match.started';
  payload: { matchId: string; mode: GameMode; state: GameState };
}

export interface MsgStateSnapshot extends ServerMsgBase {
  type: 'state.snapshot';
  matchId: string;
  stateVersion: number;
  payload: { state: GameState };
}

export interface MsgAck extends ServerMsgBase {
  type: 'ack';
  actionId: string;
  matchId?: string;
  ok: boolean;
  stateVersion?: number;
}

export interface MsgError extends ServerMsgBase {
  type: 'error';
  actionId?: string;
  matchId?: string;
  code: string;
  message: string;
  details?: unknown;
}

export interface MsgMatchEnded extends ServerMsgBase {
  type: 'match.ended';
  payload: {
    matchId: string;
    durakId: string;
    winners: string[];
    stats: Record<string, unknown>;
  };
}

export type ServerMsg =
  | MsgConnectionReady
  | MsgRoomJoined
  | MsgRoomPlayers
  | MsgMatchStarted
  | MsgStateSnapshot
  | MsgAck
  | MsgError
  | MsgMatchEnded;

// ─── Auth ──────────────────────────────────────────────────────────────────────

export interface AuthResponse {
  token: string;
  playerId: string;
  expiresAt: number;
}
