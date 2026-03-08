import { randomUUID } from "node:crypto";
import { GameRoom } from "./GameRoom.js";
import type { RuntimeRoomState } from "../persistence/domain.js";

function createRoomId() {
  return randomUUID().replace(/-/g, "").slice(0, 6).toUpperCase();
}

export class RoomRegistry {
  private rooms = new Map<string, GameRoom>();

  createRoom(roomId = createRoomId(), runtime?: RuntimeRoomState) {
    while (this.rooms.has(roomId)) {
      roomId = createRoomId();
    }

    const room = new GameRoom(roomId, runtime);
    this.rooms.set(roomId, room);
    return room;
  }

  restoreRoom(roomId: string, runtime: RuntimeRoomState) {
    const room = new GameRoom(roomId, runtime);
    this.rooms.set(roomId, room);
    return room;
  }

  getRoom(roomId: string) {
    return this.rooms.get(roomId);
  }

  getRoomIds(): string[] {
    return [...this.rooms.keys()];
  }

  removeRoom(roomId: string) {
    this.rooms.delete(roomId);
  }
}
