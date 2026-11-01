import type { BattleView } from "@roan/protocol";
const commandTypes = new Set([
  "MOVE",
  "ATTACK",
  "ATTACK_MOVE",
  "RETREAT",
  "SET_STANCE",
  "SET_FORMATION",
  "REASSIGN_COMMANDER",
  "CAST_SKILL",
  "SELECT_AUGMENT",
  "RESUPPLY",
  "RECRUIT",
]);
/** Opt-in file export of this tab's observations; never reads tokens or hidden state. */
export class PlaytestRecord {
  readonly schema = "phase7-playtest-v1";
  readonly source = "client-observations-not-authoritative-replay";
  readonly samples: unknown[] = [];
  readonly changes: unknown[] = [];
  readonly commands: { tick: number; type: string }[] = [];
  readonly replies: { tick: number; accepted: boolean; reason?: string }[] = [];
  dropped = 0;
  firstTick: number | null = null;
  lastTick = 0;
  policyVersion = "unknown";
  ruleSnapshot: unknown = null;
  result: BattleView["objectiveMatch"] = undefined;
  private nextSample = 0;
  private signature = "";
  private finished = false;
  constructor(
    readonly roomId: string,
    readonly seat: string,
  ) {}
  private append(list: unknown[], value: unknown) {
    if (list.length < 2000) list.push(value);
    else this.dropped++;
  }
  observe(view: BattleView) {
    const n = view.nationalMatch,
      me = n?.players.find((p) => p.id === this.seat);
    if (!me || !n || this.finished || view.tick < this.lastTick) return;
    this.policyVersion = n.rules.policyVersion ?? "legacy";
    this.ruleSnapshot ??= structuredClone({
      tickMs: view.config.tickMs,
      national: n.rules,
      firstObservedDeadline: n.deadline,
      objectives: view.objectiveMatch
        ? {
            limitTicks: view.objectiveMatch.limitTicks,
            captureTicks: view.objectiveMatch.captureTicks,
            scoreEveryTicks: view.objectiveMatch.scoreEveryTicks,
            points: view.objectiveMatch.points.map((p) => ({
              id: p.id,
              position: p.position,
              opensAtTick: p.opensAtTick,
              score: p.score,
            })),
          }
        : null,
    });
    this.firstTick ??= view.tick;
    this.lastTick = view.tick;
    const own = view.squads.filter(
      (s) => s.ownerPlayerId === this.seat && s.hpMilli > 0,
    );
    const sample = {
      observedTick: view.tick,
      xp: me.xp,
      level: me.level,
      merit: me.merit,
      rank: me.rank,
      supply: me.supplyPoints,
      soldiers: own.reduce((a, s) => a + s.soldiers, 0),
      livingSquads: own.length,
      selected: [...me.selected],
      points: view.objectiveMatch?.points.map((p) => ({
        id: p.id,
        owner: p.owner,
        contested: p.contested,
      })),
      scores: { ...view.objectiveMatch?.scores },
    };
    const change = {
      selected: [...me.selected],
      offer: me.offer
        ? {
            checkpoint: me.offer.checkpoint,
            candidates: [...me.offer.candidates],
          }
        : null,
      job: me.job ? { ...me.job } : null,
      feedback: me.feedback,
      emptyArmy: own.length === 0,
    };
    const signature = JSON.stringify(change);
    if (signature !== this.signature) {
      this.append(this.changes, { observedTick: view.tick, ...change });
      this.signature = signature;
    }
    if (view.tick >= this.nextSample || view.objectiveMatch?.result) {
      this.append(this.samples, sample);
      this.nextSample = (Math.floor(view.tick / 300) + 1) * 300;
    }
    if (view.objectiveMatch?.result) {
      // Public final objectives/ranking only; no allied/enemy private progression dump.
      this.result = structuredClone(view.objectiveMatch);
      this.append(this.changes, {
        observedTick: view.tick,
        ranking: structuredClone(n.ranking),
      });
      this.finished = true;
    }
  }
  command(tick: number, type: unknown) {
    if (!this.finished && typeof type === "string" && commandTypes.has(type))
      this.append(this.commands, { tick, type });
  }
  reply(tick: number, accepted: boolean, reason?: string) {
    if (!this.finished)
      this.append(this.replies, {
        tick,
        accepted,
        ...(reason ? { reason: reason.slice(0, 120) } : {}),
      });
  }
  export(notes = "") {
    return JSON.stringify(
      {
        schema: this.schema,
        source: this.source,
        roomId: this.roomId,
        seat: this.seat,
        policyVersion: this.policyVersion,
        ruleSnapshot: this.ruleSnapshot,
        coverage: {
          firstObservedTick: this.firstTick,
          lastObservedTick: this.lastTick,
          samplePeriodTicks: 300,
          exactCheckpoints: false,
          refreshResets: true,
          dropped: this.dropped,
        },
        samples: this.samples,
        changes: this.changes,
        submittedCommands: this.commands,
        admissionReplies: this.replies,
        result: this.result,
        notes: notes.slice(0, 2000),
      },
      null,
      2,
    );
  }
}
