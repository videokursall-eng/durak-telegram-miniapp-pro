import test from "node:test";
import assert from "node:assert/strict";

import { GameRoom } from "../dist/rooms/GameRoom.js";
import { createInMemoryPersistence } from "../dist/persistence/memory/InMemoryPersistence.js";
import { RoomLifecycleService } from "../dist/services/RoomLifecycleService.js";
import { ReconnectService } from "../dist/services/ReconnectService.js";

function createUser(id, displayName = id) {
  return {
    telegramUserId: id,
    username: id,
    firstName: displayName,
    lastName: null,
    photoUrl: null,
    displayName,
  };
}

function createConnection(id) {
  return {
    id,
    sent: [],
    send(payload) {
      this.sent.push(payload);
    },
  };
}

test("ReconnectService recovers room from durable snapshot when live room cache is gone", () => {
  const persistence = createInMemoryPersistence(() => 1000);
  const roomLifecycle = new RoomLifecycleService(persistence, { nowMs: () => 1000 });
  const reconnectService = new ReconnectService(persistence, roomLifecycle, { nowMs: () => 1000 });

  const host = createUser("tg_host", "Host");
  const guest = createUser("tg_guest", "Guest");

  const room = new GameRoom("ROOM42");
  const hostConn = createConnection("host-1");
  const guestConn = createConnection("guest-1");
  const created = room.createHost(host, hostConn);
  roomLifecycle.recordRoomCreated(room.toRuntimeState(), host);

  const joined = room.join(guest, guestConn);
  roomLifecycle.recordPlayerJoined(room.toRuntimeState(), guest);

  room.start(hostConn.id, "simple");
  roomLifecycle.recordMatchStarted(room.toRuntimeState());

  persistence.liveRooms.delete("ROOM42");

  const recovered = reconnectService.recoverRoomRuntime(
    "ROOM42",
    joined.sessionToken,
    guest.telegramUserId
  );

  assert.ok(recovered);
  assert.equal(recovered.roomCode, "ROOM42");
  assert.equal(recovered.state?.matchId, room.getState()?.matchId);
  assert.equal(recovered.members.length, 2);
  assert.equal(
    recovered.members.find((member) => member.playerId === joined.playerId)?.isConnected,
    true
  );
  assert.equal(
    recovered.members.find((member) => member.playerId === created.playerId)?.isConnected,
    false
  );
});

test("RoomLifecycleService stores snapshots, result history, and stats", () => {
  let nowMs = 1000;
  const persistence = createInMemoryPersistence(() => nowMs);
  const roomLifecycle = new RoomLifecycleService(persistence, { nowMs: () => nowMs });

  const host = createUser("tg_host", "Host");
  const guest = createUser("tg_guest", "Guest");

  const room = new GameRoom("ROOM99");
  const hostConn = createConnection("host-1");
  const guestConn = createConnection("guest-1");
  const created = room.createHost(host, hostConn);
  roomLifecycle.recordRoomCreated(room.toRuntimeState(), host);
  const joined = room.join(guest, guestConn);
  roomLifecycle.recordPlayerJoined(room.toRuntimeState(), guest);

  room.start(hostConn.id, "simple");
  roomLifecycle.recordMatchStarted(room.toRuntimeState());

  const startedState = room.getState();
  assert.ok(startedState);
  const initialSnapshot = persistence.snapshots.getLatestByMatchId(startedState.matchId);
  assert.ok(initialSnapshot);
  assert.equal(initialSnapshot.version, startedState.version);

  nowMs = 5000;
  const finishedState = {
    ...startedState,
    version: startedState.version + 1,
    phase: "finished",
    winnerIds: [created.playerId],
    loserId: joined.playerId,
  };
  roomLifecycle.recordStateAdvanced({
    roomCode: "ROOM99",
    mode: "simple",
    state: finishedState,
    members: room.toRuntimeState().members,
  });

  const latestSnapshot = persistence.snapshots.getLatestByMatchId(startedState.matchId);
  assert.ok(latestSnapshot);
  assert.equal(latestSnapshot.version, finishedState.version);
  assert.equal(latestSnapshot.stateJson.phase, "finished");

  const result = persistence.matchResults.getByMatchId(startedState.matchId);
  assert.ok(result);
  assert.deepEqual(result.winnerUserIds.length, 1);

  const hostUser = persistence.users.getByTelegramUserId(host.telegramUserId);
  const guestUser = persistence.users.getByTelegramUserId(guest.telegramUserId);
  assert.ok(hostUser);
  assert.ok(guestUser);

  const hostStats = persistence.stats.getUserStats(hostUser.id);
  const guestStats = persistence.stats.getUserStats(guestUser.id);
  assert.equal(hostStats?.wins, 1);
  assert.equal(guestStats?.losses, 1);
});
