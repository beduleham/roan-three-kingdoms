import rawConfig from "../../../battle_config.v1.json" with { type: "json" };
import {
  createBattle,
  step,
  parseBattleConfig,
} from "../../../packages/battle-core/dist/index.js";
import type {
  BattleInput,
  BattleState,
} from "../../../packages/battle-core/dist/index.js";
import { commandSchema } from "../../../packages/battle-core/dist/model.js";
import { NationVisibility, defaultVisionRadiusTiles } from "./visibility.js";

const config = parseBattleConfig({
  ...rawConfig,
  visibility: { radiusTiles: defaultVisionRadiusTiles },
});
export type Seat = "blue" | "red" | `blue-${1 | 2 | 3}` | `red-${1 | 2 | 3}`;
export type MatchMode = "1v1" | "3v3";
const teamSlots = [
  "blue-1",
  "red-1",
  "blue-2",
  "red-2",
  "blue-3",
  "red-3",
] as const;
export function initialOnlineBattle(): BattleState {
  return createBattle(config, 41, {
    players: ["blue", "red"].map((id) => ({ id, nationId: id, level: 16 })),
    squads: ["blue", "red"].flatMap((owner, side) =>
      (["spears", "archers"] as const).map((unitType, i) => ({
        id: `${owner}-${i + 1}`,
        ownerPlayerId: owner,
        nationId: owner,
        unitType,
        maxSoldiers: 20,
        hpMilli: 20 * config.soldierHp * config.hpMilliPerHp,
        position: {
          x: (side ? 14 : 6) * config.positionUnitsPerTile,
          y: (4 + i * 5) * config.positionUnitsPerTile,
        },
        facing: { x: side ? -1 : 1, y: 0 },
        stance: side ? ("balanced" as const) : ("defensive" as const),
      })),
    ),
    commanders: ["blue", "red"].map((owner, i) => ({
      id: `${owner}-commander`,
      ownerPlayerId: owner,
      assignedSquadId: `${owner}-1`,
      hpMilli: config.commander.baseHp * config.hpMilliPerHp,
      maxHpMilli: config.commander.baseHp * config.hpMilliPerHp,
      respawnZoneIndex: i,
    })),
    safeZones: [
      { nationId: "blue", position: { x: 2000, y: 6500 }, radiusUnits: 1500 },
      { nationId: "red", position: { x: 22000, y: 6500 }, radiusUnits: 1500 },
    ],
  });
}

export function initialTeamBattle(): BattleState {
  return createBattle(config, 41, {
    players: teamSlots.map((id) => ({
      id,
      nationId: id.startsWith("blue") ? "blue" : "red",
      level: 16,
    })),
    squads: teamSlots.flatMap((owner) => {
      const side = owner.startsWith("red") ? 1 : 0;
      const slot = Number(owner.at(-1)) - 1;
      return (["spears", "archers"] as const).map((unitType, i) => ({
        id: `${owner}-${i + 1}`,
        ownerPlayerId: owner,
        nationId: side ? "red" : "blue",
        unitType,
        maxSoldiers: 20,
        hpMilli: 20 * config.soldierHp * config.hpMilliPerHp,
        position: {
          x: (side ? 14 : 6) * config.positionUnitsPerTile,
          y: (2 + slot * 4 + i) * config.positionUnitsPerTile,
        },
        facing: { x: side ? -1 : 1, y: 0 },
        stance: side ? ("balanced" as const) : ("defensive" as const),
      }));
    }),
    commanders: teamSlots.map((owner) => ({
      id: `${owner}-commander`,
      ownerPlayerId: owner,
      assignedSquadId: `${owner}-1`,
      hpMilli: config.commander.baseHp * config.hpMilliPerHp,
      maxHpMilli: config.commander.baseHp * config.hpMilliPerHp,
      respawnZoneIndex: owner.startsWith("red") ? 1 : 0,
    })),
    safeZones: [
      { nationId: "blue", position: { x: 2000, y: 6500 }, radiusUnits: 1500 },
      { nationId: "red", position: { x: 22000, y: 6500 }, radiusUnits: 1500 },
    ],
  });
}

/** Session ID is the sole seat authority. Untrusted payload never supplies identity, seq or tick. */
export class AuthoritativeMatch {
  readonly visibility = new NationVisibility();
  state: BattleState;
  readonly mode: MatchMode;
  private started = false;
  private aiOrderedSeats = new Set<Seat>();
  private hostSessionId: string | null = null;
  private seats = new Map<string, Seat>();
  private connected = new Set<string>();
  private pending: BattleInput[] = [];
  private nextSeq = new Map<Seat, number>();
  constructor(mode: MatchMode = "1v1") {
    this.mode = mode;
    this.state = mode === "3v3" ? initialTeamBattle() : initialOnlineBattle();
    this.visibility.observe(this.state);
  }
  nation(sessionId: string) {
    const seat = this.seats.get(sessionId);
    return (
      this.state.players.find((player) => player.id === seat)?.nationId ?? null
    );
  }
  view(nationId: string) {
    return this.visibility.view(this.state, nationId);
  }
  get slots(): readonly Seat[] {
    return this.mode === "3v3" ? teamSlots : ["blue", "red"];
  }
  get lobby() {
    return {
      mode: this.mode,
      started: this.mode === "1v1" || this.started,
      slots: this.slots.map((id) => ({
        id,
        connected: [...this.seats].some(
          ([session, seat]) => seat === id && this.connected.has(session),
        ),
        host: this.seats.get(this.hostSessionId ?? "") === id,
        occupant: [...this.seats.values()].includes(id)
          ? "human"
          : this.started
            ? "AI"
            : "empty",
      })),
    };
  }
  isHost(sessionId: string) {
    return this.hostSessionId === sessionId;
  }
  start(sessionId: string): { accepted: boolean; reason?: string } {
    if (this.mode !== "3v3") return { accepted: false, reason: "INVALID_MODE" };
    if (this.started) return { accepted: false, reason: "ALREADY_STARTED" };
    if (!this.isHost(sessionId)) return { accepted: false, reason: "NOT_HOST" };
    if (this.connected.size !== this.seats.size)
      return { accepted: false, reason: "PLAYERS_DISCONNECTED" };
    const sides = [...this.seats.values()].map((seat) =>
      seat.startsWith("blue") ? "blue" : "red",
    );
    if (!sides.includes("blue") || !sides.includes("red"))
      return { accepted: false, reason: "NEED_OPPONENT" };
    this.started = true;
    return { accepted: true };
  }
  join(sessionId: string): Seat | null {
    if (this.seats.has(sessionId)) {
      this.connected.add(sessionId);
      return this.seats.get(sessionId)!;
    }
    if (this.mode === "3v3" && this.started) return null;
    const seat = this.slots.find((s) => ![...this.seats.values()].includes(s));
    if (seat) {
      if (!this.hostSessionId) this.hostSessionId = sessionId;
      this.seats.set(sessionId, seat);
      this.connected.add(sessionId);
      if (!this.nextSeq.has(seat)) this.nextSeq.set(seat, 0);
    }
    return seat ?? null;
  }
  drop(sessionId: string) {
    this.connected.delete(sessionId);
    const seat = this.seats.get(sessionId);
    if (seat) this.pending = this.pending.filter((p) => p.playerId !== seat);
  }
  reconnect(sessionId: string) {
    if (!this.seats.has(sessionId)) return false;
    this.connected.add(sessionId);
    return true;
  }
  leave(sessionId: string) {
    this.drop(sessionId);
    this.seats.delete(sessionId);
    if (this.hostSessionId === sessionId)
      this.hostSessionId =
        [...this.seats.keys()].find((id) => this.connected.has(id)) ??
        this.seats.keys().next().value ??
        null;
  }
  removeFromLobby(
    requester: string,
    targetSeat: unknown,
  ): { accepted: boolean; reason?: string; sessionId?: string } {
    if (this.mode !== "3v3") return { accepted: false, reason: "INVALID_MODE" };
    if (!this.isHost(requester)) return { accepted: false, reason: "NOT_HOST" };
    if (this.started) return { accepted: false, reason: "MATCH_STARTED" };
    const target = [...this.seats].find(([, seat]) => seat === targetSeat)?.[0];
    if (!target) return { accepted: false, reason: "INVALID_TARGET" };
    if (target === requester)
      return { accepted: false, reason: "CANNOT_REMOVE_SELF" };
    this.leave(target);
    return { accepted: true, sessionId: target };
  }
  get ready() {
    return this.mode === "3v3"
      ? this.started && this.connected.size === this.seats.size
      : this.seats.size === 2 && this.connected.size === 2;
  }
  seat(sessionId: string) {
    return this.seats.get(sessionId) ?? null;
  }
  submit(
    sessionId: string,
    payload: unknown,
  ): { accepted: boolean; reason?: string } {
    const seat = this.seats.get(sessionId);
    if (!seat || !this.connected.has(sessionId))
      return { accepted: false, reason: "NO_SEAT" };
    if (!this.ready) return { accepted: false, reason: "MATCH_PAUSED" };
    if (!payload || typeof payload !== "object" || Array.isArray(payload))
      return { accepted: false, reason: "INVALID_FORMAT" };
    const input = commandSchema.safeParse({
      playerId: seat,
      command: {
        ...payload,
        seq: this.nextSeq.get(seat)!,
        requestedTick: this.state.tick,
      },
    });
    if (!input.success) return { accepted: false, reason: "INVALID_FORMAT" };
    const cmd = input.data.command;
    if (
      cmd.squadIds.some(
        (id) =>
          this.state.squads.find((s) => s.id === id)?.ownerPlayerId !== seat,
      ) ||
      ((cmd.type === "CAST_SKILL" || cmd.type === "REASSIGN_COMMANDER") &&
        this.state.commanders.find((c) => c.id === cmd.commanderId)
          ?.ownerPlayerId !== seat)
    )
      return { accepted: false, reason: "NOT_OWNER" };
    const targetId =
      cmd.type === "ATTACK" || cmd.type === "CAST_SKILL"
        ? cmd.targetSquadId
        : undefined;
    const nation = this.nation(sessionId)!;
    if (
      targetId &&
      !this.visibility.visibleIds(this.state, nation).has(targetId)
    )
      return { accepted: false, reason: "TARGET_NOT_VISIBLE" };
    this.pending.push(input.data);
    this.nextSeq.set(seat, this.nextSeq.get(seat)! + 1);
    return { accepted: true };
  }
  advance() {
    if (!this.ready) return null;
    const commands = this.pending.splice(0);
    if (this.mode === "3v3") {
      for (const owner of this.slots.filter(
        (slot) =>
          ![...this.seats.values()].includes(slot) &&
          !this.aiOrderedSeats.has(slot),
      )) {
        this.aiOrderedSeats.add(owner);
        const lane = Number(owner.at(-1)) - 1;
        commands.push(
          commandSchema.parse({
            playerId: owner,
            command: {
              type: "ATTACK_MOVE",
              squadIds: [`${owner}-1`, `${owner}-2`],
              destination: {
                x: 10 * config.positionUnitsPerTile,
                y: (2 + lane * 4) * config.positionUnitsPerTile,
              },
              seq: this.nextSeq.get(owner) ?? 0,
              requestedTick: this.state.tick,
            },
          }),
        );
        this.nextSeq.set(owner, (this.nextSeq.get(owner) ?? 0) + 1);
      }
    }
    const result = step(this.state, commands);
    this.state = result.state;
    this.visibility.observe(this.state);
    return result;
  }
}
