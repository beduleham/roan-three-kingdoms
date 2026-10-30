import { Room, ServerError, CloseCode, type Client } from "colyseus";
import { diffState } from "@roan/protocol";
import { hashReplayValue } from "../../../packages/battle-core/dist/index.js";
import type { BattleState } from "../../../packages/battle-core/dist/index.js";
import { AuthoritativeMatch } from "./match.js";
import { InviteAccess } from "./invite.js";

export class BattleRoom extends Room {
  maxClients = 2;
  maxMessagesPerSecond = 20;
  patchRate = 200;
  protected match = new AuthoritativeMatch();
  private sentState!: BattleState;
  private accumulatedEvents: unknown[] = [];
  private inviteAccess: InviteAccess | null = null;
  private reconnectReservations = new Map<
    string,
    ReturnType<BattleRoom["allowReconnection"]>
  >();
  messages = {
    hello: (client: Client) => {
      if (!this.match.seat(client.sessionId)) return;
      if (this.inviteAccess)
        client.send("invite-key", { key: this.inviteAccess.key });
      client.send("seat", {
        seat: this.match.seat(client.sessionId),
        host: this.match.isHost(client.sessionId),
      });
      client.send("snapshot", { state: this.match.state, events: [] });
      client.send("lobby", this.match.lobby);
      this.broadcast("ready", { ready: this.match.ready });
    },
    "remove-player": (client: Client, payload: unknown) => {
      if (!this.inviteAccess) {
        client.send("lobby-result", {
          accepted: false,
          reason: "INVITE_ROOM_REQUIRED",
        });
        return;
      }
      const seat =
        payload && typeof payload === "object" && !Array.isArray(payload)
          ? (payload as Record<string, unknown>).seat
          : undefined;
      const result = this.match.removeFromLobby(client.sessionId, seat);
      if (!result.accepted || !result.sessionId) {
        client.send("lobby-result", { accepted: false, reason: result.reason });
        return;
      }
      const key = this.inviteAccess.rotate();
      for (const remaining of this.clients)
        if (this.match.seat(remaining.sessionId))
          remaining.send("invite-key", { key });
      this.clients
        .find((connected) => connected.sessionId === result.sessionId)
        ?.leave(CloseCode.CONSENTED, "REMOVED_FROM_LOBBY");
      this.reconnectReservations.get(result.sessionId)?.reject();
      this.reconnectReservations.delete(result.sessionId);
      this.broadcastLobby();
      client.send("lobby-result", { accepted: true });
    },
    "rotate-invite": (client: Client) => {
      if (!this.inviteAccess || !this.match.isHost(client.sessionId)) {
        client.send("invite-result", { accepted: false, reason: "NOT_HOST" });
        return;
      }
      client.send("invite-key", { key: this.inviteAccess.rotate() });
      client.send("invite-result", { accepted: true });
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
  async onCreate(options?: { inviteOnly?: boolean; creatorProof?: unknown }) {
    if (options?.inviteOnly === true) {
      this.inviteAccess = new InviteAccess(options.creatorProof);
      await this.setPrivate(true);
    }
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
  onAuth(_client: Client, options: unknown) {
    if (this.inviteAccess && !this.inviteAccess.authorize(options))
      throw new ServerError(403, "INVITE_REQUIRED");
    return true;
  }
  onJoin(client: Client) {
    const seat = this.match.join(client.sessionId);
    if (!seat) throw new Error("ROOM_FULL");
    this.broadcast("lobby", this.match.lobby, { except: client });
  }
  onDrop(client: Client) {
    this.match.drop(client.sessionId);
    this.broadcastLobby();
    this.reconnectReservations.set(
      client.sessionId,
      this.allowReconnection(client, 30),
    );
  }
  onReconnect(client: Client) {
    if (!this.match.reconnect(client.sessionId))
      throw new ServerError(403, "NO_SEAT");
    this.reconnectReservations.delete(client.sessionId);
    client.send("seat", {
      seat: this.match.seat(client.sessionId),
      host: this.match.isHost(client.sessionId),
    });
    client.send("snapshot", { state: this.match.state, events: [] });
    this.broadcastLobby();
  }
  onLeave(client: Client) {
    this.reconnectReservations.delete(client.sessionId);
    this.match.leave(client.sessionId);
    this.broadcastLobby();
  }
  private broadcastLobby() {
    for (const connected of this.clients)
      if (this.match.seat(connected.sessionId))
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
