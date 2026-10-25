import type { BattleConfig } from "./config.js";
import type { BattleState, Contact, Position, Squad } from "./model.js";
import { applyBp } from "./damage.js";

export const compareIds = (a: string, b: string) =>
  a < b ? -1 : a > b ? 1 : 0;
export const forced = (s: Squad) =>
  s.hpMilli === 0 || s.fsmState === "ROUTED" || s.fsmState === "BROKEN";
export function distanceSquared(a: Position, b: Position): bigint {
  const dx = BigInt(a.x) - BigInt(b.x),
    dy = BigInt(a.y) - BigInt(b.y);
  return dx * dx + dy * dy;
}
export const within = (a: Position, b: Position, radius: number) =>
  distanceSquared(a, b) <= BigInt(radius) ** 2n;
function ceilSqrt(n: bigint): bigint {
  if (n === 0n) return 0n;
  let low = 0n,
    high = n + 1n;
  while (high - low > 1n) {
    const mid = (low + high) / 2n;
    if (mid * mid < n) low = mid;
    else high = mid;
  }
  return high;
}
function integerUnits(value: number): number {
  if (!Number.isSafeInteger(value) || value < 0)
    throw new Error(
      "Spatial config must resolve to nonnegative safe integer units",
    );
  return value;
}
export const rangeUnits = (s: Squad, c: BattleConfig) =>
  integerUnits(c.unitTypes[s.unitType].rangeTiles * c.positionUnitsPerTile);
export function speedUnits(s: Squad, c: BattleConfig): number {
  const perSecond = integerUnits(
    c.unitTypes[s.unitType].speedTilesPerSec * c.positionUnitsPerTile,
  );
  const base = integerUnits((perSecond * c.tickMs) / 1000);
  return applyBp(base, c.formations[s.formation].speedBp);
}
export function chaseRadius(s: Squad, c: BattleConfig): number {
  const tiles =
    c.ai[
      s.stance === "defensive"
        ? "defensiveChaseRadiusTiles"
        : s.stance === "balanced"
          ? "balancedChaseRadiusTiles"
          : "aggressiveChaseRadiusTiles"
    ];
  return integerUnits(tiles * c.positionUnitsPerTile);
}
/** Euclidean segment step; ceil sqrt and truncation guarantee no overshoot or diagonal speed boost. */
export function moveTowards(
  from: Position,
  to: Position,
  speed: number,
): Position {
  if (speed <= 0 || distanceSquared(from, to) === 0n) return { ...from };
  if (within(from, to, speed)) return { ...to };
  const dx = BigInt(to.x) - BigInt(from.x),
    dy = BigInt(to.y) - BigInt(from.y);
  const distance = ceilSqrt(dx * dx + dy * dy);
  let x = (dx * BigInt(speed)) / distance,
    y = (dy * BigInt(speed)) / distance;
  if (x === 0n && y === 0n) {
    if (dx * dx >= dy * dy) x = dx < 0n ? -1n : 1n;
    else y = dy < 0n ? -1n : 1n;
  }
  return { x: Number(BigInt(from.x) + x), y: Number(BigInt(from.y) + y) };
}
export function directionFrom(
  defender: Squad,
  attacker: Squad,
): Contact["direction"] {
  const dx = BigInt(attacker.position.x) - BigInt(defender.position.x);
  const dy = BigInt(attacker.position.y) - BigInt(defender.position.y);
  if (dx === 0n && dy === 0n) return "front";
  const fx = BigInt(defender.facing.x),
    fy = BigInt(defender.facing.y);
  const dot = dx * fx + dy * fy;
  const inCone = 2n * dot * dot >= (dx * dx + dy * dy) * (fx * fx + fy * fy);
  return inCone ? (dot > 0n ? "front" : "rear") : "flank";
}
export function contactFor(a: Squad, b: Squad): Contact {
  const spear =
    a.unitType === "spears" ? a : b.unitType === "spears" ? b : null;
  const cavalry =
    a.unitType === "cavalry" ? a : b.unitType === "cavalry" ? b : null;
  return {
    attackerId: a.id,
    targetId: b.id,
    direction: directionFrom(b, a),
    preparedSpear:
      !!spear &&
      !!cavalry &&
      spear.formation === "defense" &&
      spear.pendingFormation === null &&
      directionFrom(spear, cavalry) === "front",
  };
}
export function isSafe(s: Squad, state: BattleState): boolean {
  return (
    state.safeZones.some(
      (z) =>
        z.nationId === s.nationId &&
        within(s.position, z.position, z.radiusUnits),
    ) &&
    !state.squads.some(
      (e) =>
        e.hpMilli > 0 &&
        e.nationId !== s.nationId &&
        within(
          s.position,
          e.position,
          Math.max(rangeUnits(s, state.config), rangeUnits(e, state.config)),
        ),
    )
  );
}
