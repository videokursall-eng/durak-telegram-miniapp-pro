import { applyAction, type GameAction, type GameState } from "@durak/shared";

type RoomClient = {
  id: string;
  send: (payload: unknown) => void;
};

export class GameRoom {
  readonly id: string;
  private state: GameState;
  private clients = new Map<string, RoomClient>();

  constructor(id: string, initialState: GameState) {
    this.id = id;
    this.state = initialState;
  }

  join(client: RoomClient) {
    this.clients.set(client.id, client);

    client.send({
      type: "room.state",
      roomId: this.id,
      state: this.state,
    });
  }

  leave(clientId: string) {
    this.clients.delete(clientId);
  }

  getState() {
    return this.state;
  }

  dispatch(action: GameAction) {
    this.state = applyAction(this.state, action);

    this.broadcast({
      type: "room.state",
      roomId: this.id,
      state: this.state,
    });
  }

  private broadcast(payload: unknown) {
    for (const client of this.clients.values()) {
      client.send(payload);
    }
  }
}