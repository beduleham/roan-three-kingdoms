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
  constructor() {
    for (const [key, url] of Object.entries(urls)) {
      const img = new Image();
      img.onerror = () => {
        this.failed = true;
      };
      img.src = url;
      this.images.set(key, img);
    }
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
    const img = this.images.get(texture),
      sheet = atlas[texture as keyof typeof atlas],
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
            tick,
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
            tick,
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
    let painted = false;
    for (let i = 0; i < count; i++)
      painted =
        this.sprite(
          ctx,
          pose.texture,
          pose.frame,
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
      if (!compact) this.sprite(ctx, p.texture, p.frame, x + 17, y - 6, 42);
      ctx.fillStyle = "#f5d589";
      ctx.font = 'bold 10px "Noto Sans KR", sans-serif';
      ctx.fillText("장", x + 12, y - (compact ? 24 : 46));
    }
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
