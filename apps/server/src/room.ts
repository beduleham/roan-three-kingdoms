import { Room, type Client } from "colyseus";
import { AuthoritativeMatch } from "./match.js";

export class BattleRoom extends Room {
  maxClients = 2;
  maxMessagesPerSecond = 20;
  patchRate = 200;
  private match = new AuthoritativeMatch();
  messages = {
    hello: (client: Client) => {
      client.send("seat", { seat: this.match.seat(client.sessionId) });
      client.send("snapshot", { state: this.match.state, events: [] });
      this.broadcast("ready", { ready: this.match.ready });
    },
    command: (client: Client, payload: unknown) => {
      const response = this.match.submit(client.sessionId, payload);
      client.send("command-result", response);
    },
  };
  onCreate() {
    this.setTimestep(() => {
      const result = this.match.advance();
      if (result)
        this.broadcast("snapshot", {
          state: result.state,
          events: result.events,
        });
    }, 100);
  }
  onJoin(client: Client) {
    const seat = this.match.join(client.sessionId);
    if (!seat) throw new Error("ROOM_FULL");
  }
  onLeave(client: Client) {
    this.match.leave(client.sessionId);
    this.broadcast("ready", { ready: false });
  }
}
