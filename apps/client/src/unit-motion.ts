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
  const row = directionRow(facing);
  const attack =
    lastHitTick !== undefined && lastHitTick <= tick && tick - lastHitTick < 4;
  const mode = attack ? "attack" : moving ? "walk" : "idle";
  return {
    texture: attack ? "spear-attack" : "spear-walk",
    frame: row * 4 + (mode === "idle" ? 0 : Math.floor(tick / 2) % 4),
    mode,
  };
}
