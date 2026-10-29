import { Room, type Client } from "colyseus";
import { diffState } from "@roan/protocol";
import { hashReplayValue } from "../../../packages/battle-core/dist/index.js";
import type { BattleState } from "../../../packages/battle-core/dist/index.js";
import { AuthoritativeMatch } from "./match.js";

export class BattleRoom extends Room {
  maxClients = 2;
  maxMessagesPerSecond = 20;
  patchRate = 200;
  protected match = new AuthoritativeMatch();
  private sentState!: BattleState;
  private accumulatedEvents: unknown[] = [];
  messages = {
    hello: (client: Client) => {
      client.send("seat", {
        seat: this.match.seat(client.sessionId),
        host: this.match.isHost(client.sessionId),
      });
      client.send("snapshot", { state: this.match.state, events: [] });
      client.send("lobby", this.match.lobby);
      this.broadcast("ready", { ready: this.match.ready });
    },
    command: (client: Client, payload: unknown) => {
      const response = this.match.submit(client.sessionId, payload);
      client.send("command-result", response);
    },
    start: (client: Client) => {
      const response = this.match.start(client.sessionId);
      client.send("start-result", response);
      if (response.accepted) {
        void this.lock();
        this.broadcast("lobby", this.match.lobby);
        this.broadcast("ready", { ready: true });
      }
    },
  };
  onCreate() {
    this.sentState = this.match.state;
    this.setTimestep(() => {
      const result = this.match.advance();
      if (!result) return;
      this.accumulatedEvents.push(...result.events);
      if (result.state.tick % 2 !== 0) return;
      this.broadcast("delta", {
        baseTick: this.sentState.tick,
        tick: result.state.tick,
        hash: hashReplayValue(result.state),
        changes: diffState(this.sentState, result.state),
        events: this.accumulatedEvents,
      });
      this.sentState = result.state;
      this.accumulatedEvents = [];
    }, 100);
  }
  onJoin(client: Client) {
    const seat = this.match.join(client.sessionId);
    if (!seat) throw new Error("ROOM_FULL");
    this.broadcast("lobby", this.match.lobby, { except: client });
  }
  onDrop(client: Client) {
    this.match.drop(client.sessionId);
    this.broadcast("ready", { ready: false });
    this.allowReconnection(client, 30);
  }
  onReconnect(client: Client) {
    this.match.reconnect(client.sessionId);
    client.send("seat", {
      seat: this.match.seat(client.sessionId),
      host: this.match.isHost(client.sessionId),
    });
    client.send("snapshot", { state: this.match.state, events: [] });
    client.send("lobby", this.match.lobby);
    this.broadcast("ready", { ready: this.match.ready });
  }
  onLeave(client: Client) {
    this.match.leave(client.sessionId);
    for (const connected of this.clients)
      connected.send("seat", {
        seat: this.match.seat(connected.sessionId),
        host: this.match.isHost(connected.sessionId),
      });
    this.broadcast("lobby", this.match.lobby);
    this.broadcast("ready", { ready: this.match.ready });
  }
}

export class Battle3v3Room extends BattleRoom {
  maxClients = 6;
  protected override match = new AuthoritativeMatch("3v3");
}
