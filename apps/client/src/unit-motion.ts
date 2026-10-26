export type Facing = { x: number; y: number };
export function directionRow(f: Facing): number {
  const screenX = f.x - f.y,
    screenY = f.x + f.y;
  return screenY >= 0 ? (screenX >= 0 ? 0 : 1) : screenX < 0 ? 2 : 3;
}
// Presentation policy only: continuous hits do not restart the animation each tick.
export function spearPose(
  facing: Facing,
  tick: number,
  moving: boolean,
  lastHitTick?: number,
) {
  return footPose("spears", facing, tick, moving, lastHitTick);
}
export function footPose(
  kind: "spears" | "infantry" | "archers",
  facing: Facing,
  tick: number,
  moving: boolean,
  lastHitTick?: number,
) {
  const prefix =
    kind === "spears" ? "spear" : kind === "archers" ? "archer" : "infantry";
  const attack =
    lastHitTick !== undefined && lastHitTick <= tick && tick - lastHitTick < 4;
  const mode = attack ? "attack" : moving ? "walk" : "idle";
  return {
    texture: `${prefix}-${attack ? "attack" : "walk"}`,
    frame:
      directionRow(facing) * 4 +
      (mode === "idle" ? 0 : Math.floor(tick / 2) % 4),
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
) {
  const mode = !moving ? "idle" : charging ? "charge" : "canter";
  return {
    texture: `${kind}-canter`,
    frame:
      directionRow(facing) * 4 +
      (mode === "idle"
        ? 0
        : Math.floor(tick / (mode === "charge" ? 1 : 2)) % 4),
    mode,
  };
}
