import type { BattleView, VisibleBattleEvent } from "@roan/protocol";
import settings from "./presentation-settings.json";
import { worldToMap, type MapCamera } from "./map-camera.js";
export type Cue = "hit" | "Q" | "W" | "R" | "rout" | "wounded" | "end";
type Effect = {
  tick: number;
  kind: Cue;
  position: { x: number; y: number };
  entityId: string;
};
/** Consumes only verified, visible projections. Snapshots establish a baseline, not a replay. */
export class BattlePresentation {
  effects: Effect[] = [];
  private seen = new Set<string>();
  private previous: BattleView | null = null;
  reset() {
    this.effects = [];
    this.seen.clear();
    this.previous = null;
  }
  baseline(v: BattleView) {
    this.previous = v;
    this.effects = [];
  }
  ingest(v: BattleView, events: VisibleBattleEvent[]): Cue[] {
    const cues: Cue[] = [];
    const squad = (id: string) => v.squads.find((s) => s.id === id);
    const anchor = (id: string) =>
      squad(id) ??
      squad(v.commanders.find((c) => c.id === id)?.assignedSquadId ?? "");
    const emit = (
      key: string,
      kind: Cue,
      id: string,
      tick: number,
      position: { x: number; y: number },
    ) => {
      if (this.seen.has(key)) return;
      this.seen.add(key);
      while (this.seen.size > settings.maxSeenEvents)
        this.seen.delete(this.seen.values().next().value!);
      this.effects.push({
        kind,
        entityId: id,
        tick: v.tick,
        position: { ...position },
      });
      cues.push(kind);
    };
    // Skill cues get priority over repeated ordinary hits in the audio voice budget.
    for (const e of [...events].sort(
      (a, b) =>
        (a.type === "ATTACK_HIT" ? 1 : 0) - (b.type === "ATTACK_HIT" ? 1 : 0),
    )) {
      if (e.tick > v.tick || v.tick - e.tick > settings.effectTicks) continue;
      const actor = anchor(e.actorId);
      if (!actor || actor.hpMilli <= 0) continue;
      let kind: Cue | undefined;
      if (e.type === "CHARGE_IMPACT") kind = "Q";
      else if (e.type === "SKILL_CAST" && (e.skill === "W" || e.skill === "R"))
        kind = e.skill;
      else if (
        e.type === "ATTACK_HIT" &&
        e.delta !== undefined &&
        e.delta < 0 &&
        e.targetId &&
        squad(e.targetId)
      )
        kind = "hit";
      if (!kind) continue;
      const target = kind === "hit" ? squad(e.targetId!)! : actor;
      emit(
        JSON.stringify([e.tick, e.type, e.actorId, e.targetId, e.skill]),
        kind,
        target.id,
        e.tick,
        target.position,
      );
    }
    if (this.previous) {
      for (const s of v.squads) {
        const old = this.previous.squads.find((p) => p.id === s.id);
        if (
          old &&
          s.hpMilli > 0 &&
          s.fsmState === "ROUTED" &&
          old.fsmState !== "ROUTED"
        )
          emit(`rout:${v.tick}:${s.id}`, "rout", s.id, v.tick, s.position);
      }
      for (const c of v.commanders) {
        const old = this.previous.commanders.find((p) => p.id === c.id),
          host = squad(c.assignedSquadId ?? old?.assignedSquadId ?? "");
        if (old && host && c.status === "WOUNDED" && old.status !== "WOUNDED")
          emit(
            `wound:${v.tick}:${c.id}`,
            "wounded",
            host.id,
            v.tick,
            host.position,
          );
      }
      if (v.objectiveMatch?.result && !this.previous.objectiveMatch?.result)
        cues.push("end");
    }
    this.previous = v;
    this.effects = (v.objectiveMatch?.result ? [] : this.effects)
      .filter(
        (e) => v.tick - e.tick < settings.effectTicks && !!squad(e.entityId),
      )
      .slice(-settings.maxEffects);
    return cues;
  }
  draw(
    ctx: CanvasRenderingContext2D,
    c: MapCamera,
    v: BattleView,
    reduced: boolean,
    drawWounded?: (
      x: number,
      y: number,
      progress: number,
      reduced: boolean,
    ) => void,
  ) {
    for (const e of this.effects) {
      // Visibility is checked again each frame; effects cannot reveal an entity lost into fog.
      if (!v.squads.some((s) => s.id === e.entityId)) continue;
      const age = v.tick - e.tick;
      if (age < 0 || age >= settings.effectTicks) continue;
      const p = worldToMap(e.position, c),
        t = age / settings.effectTicks;
      if (e.kind === "wounded") drawWounded?.(p.x, p.y, t, reduced);
      ctx.save();
      ctx.globalAlpha = 1 - t;
      ctx.lineWidth = e.kind === "hit" ? 2 : 3;
      ctx.strokeStyle =
        e.kind === "R"
          ? "#f4bd63"
          : e.kind === "W"
            ? "#b0e9d6"
            : e.kind === "Q"
              ? "#f18d58"
              : "#f1d79b";
      if (e.kind === "hit") {
        ctx.beginPath();
        ctx.moveTo(p.x - 8, p.y - 20);
        ctx.lineTo(p.x + 8, p.y - 4);
        ctx.moveTo(p.x + 8, p.y - 20);
        ctx.lineTo(p.x - 8, p.y - 4);
        ctx.stroke();
      } else if (e.kind === "Q" || e.kind === "W" || e.kind === "R") {
        const r = 16 + (reduced ? 0 : t * 35);
        ctx.beginPath();
        ctx.ellipse(p.x, p.y, r, r / 2, 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.font = 'bold 13px "Noto Sans KR",sans-serif';
        ctx.fillStyle = ctx.strokeStyle;
        ctx.fillText(e.kind, p.x - 4, p.y - 38 - (reduced ? 0 : t * 12));
      } else {
        ctx.font = 'bold 12px "Noto Sans KR",sans-serif';
        ctx.fillStyle = "#f3c9a1";
        ctx.fillText(
          e.kind === "wounded" ? "장수 부상" : "패주",
          p.x - 20,
          p.y - 38 - (reduced ? 0 : t * 10),
        );
      }
      ctx.restore();
    }
  }
}
