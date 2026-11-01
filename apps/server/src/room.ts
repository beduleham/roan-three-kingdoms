import { randomInt } from "node:crypto";
import rawNational from "../../../national_demo.v1.json" with { type: "json" };
import { Room, ServerError, CloseCode, type Client } from "colyseus";
import {
  diffState,
  type BattleView,
  type VisibleBattleEvent,
} from "@roan/protocol";
import { hashReplayValue } from "../../../packages/battle-core/dist/index.js";
import rawObjectives from "../../../objective_demo.v1.json" with { type: "json" };
import {
  nationalRulesSchema,
  objectiveRulesSchema,
} from "../../../packages/battle-core/dist/index.js";
import { AuthoritativeMatch } from "./match.js";
import { InviteAccess } from "./invite.js";
import { accountAuth, publicIdentity, type Identity } from "./auth.js";

export class BattleRoom extends Room {
  maxClients = 2;
  maxMessagesPerSecond = 20;
  patchRate = 200;
  protected match = new AuthoritativeMatch();
  protected accounts = accountAuth;
  private accountSeats = new Map<string, string>();
  private sentViews = new Map<string, BattleView>();
  private accumulatedEvents = new Map<string, VisibleBattleEvent[]>();
  private inviteAccess: InviteAccess | null = null;
  private reconnectReservations = new Map<
    string,
    ReturnType<BattleRoom["allowReconnection"]>
  >();
  messages = {
    hello: (client: Client) => {
      if (!this.match.seat(client.sessionId)) return;
      client.send("account", publicIdentity(client.auth as Identity));
      if (this.inviteAccess)
        client.send("invite-key", { key: this.inviteAccess.key });
      client.send("seat", {
        seat: this.match.seat(client.sessionId),
        host: this.match.isHost(client.sessionId),
      });
      this.sendSnapshot(client);
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
    const nations = [
      ...new Set(this.match.state.players.map((player) => player.nationId)),
    ];
    for (const nation of nations) {
      this.sentViews.set(nation, this.match.view(nation));
      this.accumulatedEvents.set(nation, []);
    }
    this.setTimestep(() => {
      const result = this.match.advance();
      if (!result) return;
      for (const nation of nations)
        this.accumulatedEvents
          .get(nation)!
          .push(
            ...this.match.visibility.events(
              result.state,
              nation,
              result.events,
            ),
          );
      if (this.match.objectiveMatch?.result) {
        void this.lock();
        for (const client of this.clients) this.sendSnapshot(client);
        this.broadcast("ready", { ready: false });
        return;
      }
      if (result.state.tick % 2 !== 0) return;
      for (const nation of nations) {
        const view = this.match.view(nation),
          before = this.sentViews.get(nation)!;
        const knownIds = new Set(
          [...view.squads, ...view.commanders].map((entity) => entity.id),
        );
        result.state.players
          .filter((player) => player.nationId === nation)
          .forEach((player) => knownIds.add(player.id));
        const events = this.accumulatedEvents
          .get(nation)!
          .filter(
            (event) =>
              knownIds.has(event.actorId) &&
              (!event.targetId || knownIds.has(event.targetId)),
          );
        const delta = {
          baseTick: before.tick,
          tick: view.tick,
          hash: hashReplayValue(view),
          changes: diffState(before, view),
          events,
        };
        for (const client of this.clients)
          if (this.match.nation(client.sessionId) === nation)
            client.send("delta", delta);
        this.sentViews.set(nation, view);
        this.accumulatedEvents.set(nation, []);
      }
    }, 100);
  }
  onAuth(_client: Client, options: unknown) {
    let identity: Identity;
    try {
      identity = this.accounts.authenticate(options);
    } catch {
      throw new ServerError(401, "ACCOUNT_SESSION_EXPIRED");
    }
    if (this.inviteAccess && !this.inviteAccess.authorize(options))
      throw new ServerError(403, "INVITE_REQUIRED");
    if (
      identity.provider === "google" &&
      this.accountSeats.has(identity.accountId)
    )
      throw new ServerError(403, "ACCOUNT_ALREADY_IN_ROOM");
    return identity;
  }
  onJoin(client: Client) {
    const identity = client.auth as Identity;
    const seat = this.match.join(client.sessionId);
    if (!seat) throw new Error("ROOM_FULL");
    if (identity.provider === "google")
      this.accountSeats.set(identity.accountId, client.sessionId);
    this.broadcast("lobby", this.match.lobby, { except: client });
  }
  onDrop(client: Client) {
    if (!this.match.seat(client.sessionId)) return;
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
    this.sendSnapshot(client);
    this.broadcastLobby();
  }
  onLeave(client: Client) {
    const identity = client.auth as Identity | undefined;
    if (
      identity?.provider === "google" &&
      this.accountSeats.get(identity.accountId) === client.sessionId
    )
      this.accountSeats.delete(identity.accountId);
    this.reconnectReservations.delete(client.sessionId);
    this.match.leave(client.sessionId);
    if (this.match.objectiveMatch?.result) {
      void this.lock();
      for (const connected of this.clients) this.sendSnapshot(connected);
    }
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
  private sendSnapshot(client: Client) {
    const nation = this.match.nation(client.sessionId);
    if (nation)
      client.send("snapshot", { state: this.match.view(nation), events: [] });
  }
}

export class Battle3v3Room extends BattleRoom {
  maxClients = 6;
  protected override match = new AuthoritativeMatch("3v3");
}

/** Separate experimental room; client join options cannot override objective rules. */
export class ObjectiveBattleRoom extends BattleRoom {
  protected override match = new AuthoritativeMatch(
    "objectives",
    objectiveRulesSchema.parse(rawObjectives),
  );
}

export class NationalBattleRoom extends BattleRoom {
  maxClients = 9;
  protected override match = new AuthoritativeMatch(
    "national",
    undefined,
    nationalRulesSchema.parse(rawNational),
    randomInt(1, 0x7fffffff),
  );
}
