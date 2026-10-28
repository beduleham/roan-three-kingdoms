export type Facing = { x: number; y: number };
export function directionRow(f: Facing): number {
  const screenX = f.x - f.y,
    screenY = f.x + f.y;
  return screenY >= 0 ? (screenX >= 0 ? 0 : 1) : screenX < 0 ? 2 : 3;
}
// Presentation only: play all four attack frames relative to the actual hit tick.
export const footAnimation = {
  attackFrames: 4,
  attackTicksPerFrame: 1,
  walkTicksPerFrame: 2,
} as const;
export function spearPose(
  facing: Facing,
  tick: number,
  moving: boolean,
  attackStartTick?: number,
) {
  return footPose("spears", facing, tick, moving, attackStartTick);
}
export function footPose(
  kind: "spears" | "infantry" | "archers",
  facing: Facing,
  tick: number,
  moving: boolean,
  attackStartTick?: number,
) {
  const prefix =
    kind === "spears" ? "spear" : kind === "archers" ? "archer" : "infantry";
  const attack =
    attackStartTick !== undefined &&
    attackStartTick <= tick &&
    tick - attackStartTick <
      footAnimation.attackFrames * footAnimation.attackTicksPerFrame;
  const mode = attack ? "attack" : moving ? "walk" : "idle";
  return {
    texture: `${prefix}-${attack ? "attack" : "walk"}`,
    frame:
      directionRow(facing) * 4 +
      (attack
        ? Math.floor(
            (tick - attackStartTick!) / footAnimation.attackTicksPerFrame,
          )
        : mode === "idle"
          ? 0
          : Math.floor(tick / footAnimation.walkTicksPerFrame) % 4),
    mode,
  };
}

export interface MotionSample {
  x: number;
  y: number;
  tick: number;
  moving: boolean;
  dx: number;
  dy: number;
}
export function observeMotion(
  previous: MotionSample | undefined,
  position: Facing,
  tick: number,
): MotionSample {
  if (!previous || tick < previous.tick)
    return { ...position, tick, moving: false, dx: 0, dy: 0 };
  if (tick === previous.tick) return previous;
  const dx = position.x - previous.x,
    dy = position.y - previous.y;
  return { ...position, tick, moving: dx !== 0 || dy !== 0, dx, dy };
}
export function mountedPose(
  facing: Facing,
  tick: number,
  moving: boolean,
  charging: boolean,
  kind: "cavalry" | "commander",
  attackStartTick?: number,
) {
  const attacking =
    kind === "cavalry" &&
    !charging &&
    attackStartTick !== undefined &&
    attackStartTick <= tick &&
    tick - attackStartTick <
      footAnimation.attackFrames * footAnimation.attackTicksPerFrame;
  const mode = attacking
    ? "attack"
    : !moving
      ? "idle"
      : charging
        ? "charge"
        : "canter";
  return {
    texture: `${kind}-${attacking ? "attack" : "canter"}`,
    frame:
      directionRow(facing) * 4 +
      (attacking
        ? Math.floor(
            (tick - attackStartTick!) / footAnimation.attackTicksPerFrame,
          )
        : mode === "idle"
          ? 0
          : Math.floor(tick / (mode === "charge" ? 1 : 2)) % 4),
    mode,
  };
}

export interface AttackSample {
  startTick: number;
  lastEventTick: number;
  facing: Facing;
}
/** Group per-tick damage into complete clips. Begin on receipt, since events precede state.tick. */
export function observeAttack(
  previous: AttackSample | undefined,
  eventTick: number,
  tick: number,
  facing: Facing,
): AttackSample | undefined {
  if (previous && tick < previous.startTick) previous = undefined;
  if (eventTick > tick) return previous;
  if (previous && eventTick <= previous.lastEventTick) return previous;
  const active =
    previous &&
    tick - previous.startTick <
      footAnimation.attackFrames * footAnimation.attackTicksPerFrame
      ? previous
      : undefined;
  return {
    startTick: active?.startTick ?? tick,
    lastEventTick: eventTick,
    facing: { ...(active?.facing ?? facing) },
  };
}
