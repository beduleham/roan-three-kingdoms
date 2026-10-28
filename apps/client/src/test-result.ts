import { livingSoldiers } from "../../../packages/battle-core/src/index.js";
import type {
  BattleState,
  BattleEvent,
} from "../../../packages/battle-core/src/index.js";
export interface TestSideResult {
  playerId: string;
  initialSoldiers: number;
  remainingSoldiers: number;
  defeatedSquads: number;
  skills: { Q: number; W: number; R: number };
  chargeImpacts: number;
}
export interface TestResult {
  outcome: "enemy-eliminated" | "human-eliminated" | "mutual-elimination";
  tick: number;
  elapsedMs: number;
  sides: TestSideResult[];
}
/** Local demo stop condition only; not the planned national-score victory system. */
export function testResult(
  initial: BattleState,
  state: BattleState,
  events: readonly BattleEvent[],
): TestResult | null {
  const human = state.squads.filter((s) => s.ownerPlayerId === "human");
  const enemy = state.squads.filter((s) => s.ownerPlayerId === "enemy");
  if (!human.length || !enemy.length) return null;
  const humanGone = human.every((s) => s.hpMilli === 0),
    enemyGone = enemy.every((s) => s.hpMilli === 0);
  if (!humanGone && !enemyGone) return null;
  const owners = new Map(
    [...initial.squads, ...initial.commanders].map((s) => [
      s.id,
      s.ownerPlayerId,
    ]),
  );
  const sides = ["human", "enemy"].map((playerId) => {
    const squads = state.squads.filter((s) => s.ownerPlayerId === playerId);
    const ownEvents = events.filter((e) => owners.get(e.actorId) === playerId);
    return {
      playerId,
      initialSoldiers: initial.squads
        .filter((s) => s.ownerPlayerId === playerId)
        .reduce((sum, s) => sum + livingSoldiers(s, initial.config), 0),
      remainingSoldiers: squads.reduce(
        (sum, s) => sum + livingSoldiers(s, state.config),
        0,
      ),
      defeatedSquads: squads.filter((s) => s.hpMilli === 0).length,
      skills: Object.fromEntries(
        (["Q", "W", "R"] as const).map((skill) => [
          skill,
          ownEvents.filter((e) => e.type === "SKILL_CAST" && e.skill === skill)
            .length,
        ]),
      ) as TestSideResult["skills"],
      chargeImpacts: ownEvents.filter((e) => e.type === "CHARGE_IMPACT").length,
    };
  });
  return {
    outcome:
      humanGone && enemyGone
        ? "mutual-elimination"
        : humanGone
          ? "human-eliminated"
          : "enemy-eliminated",
    tick: state.tick,
    elapsedMs: state.tick * state.config.tickMs,
    sides,
  };
}
