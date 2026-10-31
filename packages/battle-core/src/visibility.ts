import type { BattleState } from "./model.js";

/** Pure nation-shared vision. Missing configuration preserves the local demo's full visibility. */
export function visibleSquadIds(
  state: BattleState,
  nationId: string,
  radiusTiles = state.config.visibility?.radiusTiles,
): Set<string> {
  if (radiusTiles === undefined) return new Set(state.squads.map((s) => s.id));
  const units = radiusTiles * state.config.positionUnitsPerTile;
  if (!Number.isSafeInteger(units) || units <= 0)
    throw new Error("Invalid vision radius");
  const squared = BigInt(units) ** 2n;
  const observers = state.squads.filter(
    (s) => s.nationId === nationId && s.hpMilli > 0,
  );
  return new Set(
    state.squads
      .filter(
        (s) =>
          s.nationId === nationId ||
          observers.some((observer) => {
            const x = BigInt(s.position.x) - BigInt(observer.position.x),
              y = BigInt(s.position.y) - BigInt(observer.position.y);
            return x * x + y * y <= squared;
          }),
      )
      .map((s) => s.id),
  );
}
