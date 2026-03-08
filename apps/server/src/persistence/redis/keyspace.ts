export const ROOM_SESSION_TTL_SECONDS = 60 * 60 * 24;
export const LIVE_ROOM_TTL_SECONDS = 60 * 60 * 24;

export function buildAuthSessionKey(token: string) {
  return `auth:session:${token}`;
}

export function buildLiveRoomKey(roomCode: string) {
  return `room:live:${roomCode}`;
}

export function buildRoomSessionKey(tokenHash: string) {
  return `room:session:${tokenHash}`;
}

export function buildRoomSessionIndexKey(roomCode: string) {
  return `room:session:index:${roomCode}`;
}
