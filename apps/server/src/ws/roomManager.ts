/**
 * Room manager — in-memory store for rooms and their player lists.
 */

import type { RoomInfo, RoomPlayer, GameMode } from '@durak/shared';
import { v4 as uuidv4 } from 'uuid';

export interface Room {
  id: string;
  name: string;
  mode: GameMode;
  maxPlayers: number;
  players: RoomPlayer[];
  matchId: string | null;
  isOpen: boolean;
}

const rooms = new Map<string, Room>();

export function getOrCreateDefaultRoom(): Room {
  const id = 'default';
  if (!rooms.has(id)) {
    rooms.set(id, {
      id,
      name: 'Главная комната',
      mode: 'simple',
      maxPlayers: 4,
      players: [],
      matchId: null,
      isOpen: true,
    });
  }
  return rooms.get(id)!;
}

export function getRoom(id: string): Room | undefined {
  return rooms.get(id);
}

export function createRoom(options: {
  name?: string;
  mode?: GameMode;
  maxPlayers?: number;
}): Room {
  const id = `room_${uuidv4().slice(0, 8)}`;
  const room: Room = {
    id,
    name: options.name ?? `Комната ${id}`,
    mode: options.mode ?? 'simple',
    maxPlayers: options.maxPlayers ?? 4,
    players: [],
    matchId: null,
    isOpen: true,
  };
  rooms.set(id, room);
  return room;
}

export function addPlayerToRoom(roomId: string, player: RoomPlayer): boolean {
  const room = rooms.get(roomId);
  if (!room || !room.isOpen) return false;
  if (room.players.find((p) => p.id === player.id)) return true; // already in
  if (room.players.length >= room.maxPlayers) return false;
  const isOwner = room.players.length === 0;
  room.players.push({ ...player, isOwner });
  return true;
}

export function removePlayerFromRoom(roomId: string, playerId: string): void {
  const room = rooms.get(roomId);
  if (!room) return;
  room.players = room.players.filter((p) => p.id !== playerId);
  // If the owner left, assign ownership to next player
  if (room.players.length > 0 && !room.players.find((p) => p.isOwner)) {
    room.players[0].isOwner = true;
  }
}

export function roomToInfo(room: Room): RoomInfo {
  return {
    id: room.id,
    name: room.name,
    mode: room.mode,
    maxPlayers: room.maxPlayers,
    playerCount: room.players.length,
    isOpen: room.isOpen,
  };
}
