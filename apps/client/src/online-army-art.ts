import atlas from "./motion-atlas.json";
import spearWalk from "./spear-walk.svg?url";
import spearAttack from "./spear-attack.svg?url";
import infantryWalk from "./infantry-walk.svg?url";
import infantryAttack from "./infantry-attack.svg?url";
import archerWalk from "./archer-walk.svg?url";
import archerAttack from "./archer-attack.svg?url";
import cavalryWalk from "./cavalry-canter.svg?url";
import cavalryAttack from "./cavalry-attack.svg?url";
import commanderWalk from "./commander-canter.svg?url";
import {
  footPose,
  mountedPose,
  observeMotion,
  observeAttack,
  type MotionSample,
  type AttackSample,
} from "./unit-motion.js";
import { squadFeedback } from "./squad-feedback.js";
import type { VisibleSquad, VisibleBattleEvent } from "@roan/protocol";
const urls = {
  "spear-walk": spearWalk,
  "spear-attack": spearAttack,
  "infantry-walk": infantryWalk,
  "infantry-attack": infantryAttack,
  "archer-walk": archerWalk,
  "archer-attack": archerAttack,
  "cavalry-canter": cavalryWalk,
  "cavalry-attack": cavalryAttack,
  "commander-canter": commanderWalk,
};
export function armyHit(
  position: { x: number; y: number },
  foot: { x: number; y: number },
) {
  return (
    Math.abs(position.x - foot.x) <= 29 &&
    position.y >= foot.y - 48 &&
    position.y <= foot.y + 18
  );
}
/** Cached art and observed motions only; has no access to authoritative commands/state mutation. */
export class OnlineArmyArt {
  private images = new Map<string, HTMLImageElement>();
  private motion = new Map<string, MotionSample>();
  private attacks = new Map<string, AttackSample>();
  private damage = new Map<string, number>();
  private failed = false;
  reducedMotion = false;
  constructor() {
    for (const key of ["spear-walk", "archer-walk", "commander-canter"])
      this.image(key);
  }
  get requestedAssets() {
    return this.images.size;
  }
  private image(key: string) {
    let img = this.images.get(key);
    if (!img) {
      const url = urls[key as keyof typeof urls];
      if (!url) return undefined;
      img = new Image();
      img.onerror = () => {
        this.failed = true;
      };
      img.src = url;
      this.images.set(key, img);
    }
    return img;
  }
  get status() {
    return this.failed
      ? "degraded"
      : [...this.images.values()].every((i) => i.complete && i.naturalWidth > 0)
        ? "ready"
        : "loading";
  }
  reset() {
    this.motion.clear();
    this.attacks.clear();
    this.damage.clear();
  }
  private sprite(
    ctx: CanvasRenderingContext2D,
    texture: string,
    frame: number,
    x: number,
    y: number,
    height: number,
  ) {
    let img = this.image(texture);
    if ((!img?.complete || !img.naturalWidth) && texture.endsWith("-attack")) {
      texture =
        texture === "cavalry-attack"
          ? "cavalry-canter"
          : texture.replace("-attack", "-walk");
      img = this.image(texture);
    }
    const sheet = atlas[texture as keyof typeof atlas],
      rect = sheet?.frames[frame];
    if (!img?.complete || !img.naturalWidth || !rect) return false;
    const h =
        height * ("displayScale" in sheet ? Number(sheet.displayScale) : 1),
      w = (h * rect.width) / rect.height;
    ctx.drawImage(
      img,
      rect.x,
      rect.y,
      rect.width,
      rect.height,
      x - w * rect.originX,
      y - h * rect.originY,
      w,
      h,
    );
    return true;
  }
  /** Observed injury transition only; a fading display clip, never a replacement commander entity. */
  drawWounded(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    progress: number,
    reduced: boolean,
  ) {
    ctx.save();
    ctx.translate(x, y - 7);
    ctx.rotate(reduced ? 0 : Math.min(0.8, progress * 0.8));
    ctx.globalAlpha = 1 - progress;
    this.sprite(ctx, "commander-canter", 0, 0, 0, 34);
    ctx.restore();
  }
  draw(
    ctx: CanvasRenderingContext2D,
    s: VisibleSquad,
    x: number,
    y: number,
    tick: number,
    events: VisibleBattleEvent[],
    commander: boolean,
    compact = false,
  ) {
    if (s.hpMilli <= 0) return;
    const motion = observeMotion(this.motion.get(s.id), s.position, tick);
    this.motion.set(s.id, motion);
    for (const e of events) {
      if (e.actorId === s.id && e.type === "ATTACK_HIT") {
        const sample = observeAttack(
          this.attacks.get(s.id),
          e.tick,
          tick,
          s.facing,
        );
        if (sample) this.attacks.set(s.id, sample);
      }
      if (e.targetId === s.id && typeof e.delta === "number" && e.delta < 0)
        this.damage.set(s.id, e.tick);
    }
    const feedback = squadFeedback(s, tick, this.damage.get(s.id));
    const pose =
      s.unitType === "cavalry"
        ? mountedPose(
            s.facing,
            s.fsmState === "ROUTED" ? tick * 2 : tick,
            motion.moving,
            false,
            "cavalry",
            feedback.attackAllowed
              ? this.attacks.get(s.id)?.startTick
              : undefined,
          )
        : footPose(
            s.unitType === "infantry"
              ? "infantry"
              : s.unitType === "archers"
                ? "archers"
                : "spears",
            s.facing,
            s.fsmState === "ROUTED" ? tick * 2 : tick,
            motion.moving,
            feedback.attackAllowed
              ? this.attacks.get(s.id)?.startTick
              : undefined,
          );
    ctx.save();
    ctx.globalAlpha = feedback.alpha;
    const color =
      s.nationId === "blue"
        ? "#4b9bc6"
        : s.nationId === "green"
          ? "#68ac76"
          : "#d16a50";
    ctx.fillStyle = "#171c1a88";
    ctx.beginPath();
    ctx.ellipse(x, y + 4, 25, 10, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(x, y + 3, 24, 10, 0, 0, Math.PI * 2);
    ctx.stroke();
    const count = compact
      ? 1
      : Math.min(4, Math.max(1, Math.ceil(s.soldiers / 5)));
    // Procedural display clips: hit recoil, broken sway, and routed stride. Never move the server foot.
    ctx.save();
    if (!this.reducedMotion) {
      const age = tick - (this.damage.get(s.id) ?? -100),
        hit = age >= 0 && age < 3 ? (3 - age) * 1.5 : 0;
      ctx.translate(
        -Math.sign(s.facing.x - s.facing.y) * hit,
        s.fsmState === "BROKEN"
          ? Math.sin(tick) * 2
          : s.fsmState === "IDLE"
            ? Math.sin(tick * 0.3) * 0.7
            : 0,
      );
    }
    const frame = this.reducedMotion
      ? Math.floor(pose.frame / 4) * 4
      : pose.frame;
    let painted = false;
    for (let i = 0; i < count; i++)
      painted =
        this.sprite(
          ctx,
          pose.texture,
          frame,
          x + (compact ? 0 : i % 2 ? 9 : -9),
          y + (i < 2 ? -5 : 5),
          compact ? 26 : s.unitType === "cavalry" ? 38 : 32,
        ) || painted;
    if (!painted) {
      ctx.fillStyle = color;
      ctx.fillRect(x - 9, y - 19, 18, 20);
    }
    if (commander) {
      const p = mountedPose(s.facing, tick, motion.moving, false, "commander");
      if (!compact)
        this.sprite(
          ctx,
          p.texture,
          this.reducedMotion ? Math.floor(p.frame / 4) * 4 : p.frame,
          x + 17,
          y - 6,
          42,
        );
      ctx.fillStyle = "#f5d589";
      ctx.font = 'bold 10px "Noto Sans KR", sans-serif';
      ctx.fillText("장", x + 12, y - (compact ? 24 : 46));
    }
    ctx.restore();
    ctx.globalAlpha = 1;
    ctx.fillStyle = "#18231d";
    ctx.fillRect(x - 22, y + 14, 44, 4);
    ctx.fillStyle = color;
    ctx.fillRect(
      x - 22,
      y + 14,
      44 * Math.min(1, s.soldiers / s.maxSoldiers),
      4,
    );
    if (feedback.label) {
      ctx.font = 'bold 11px "Noto Sans KR",sans-serif';
      ctx.fillStyle = feedback.label === "피격" ? "#ffce8a" : "#e9bb8d";
      ctx.fillText(feedback.label, x - 12, y - 34);
    }
    ctx.restore();
  }
}
