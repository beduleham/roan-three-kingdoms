import { z } from "zod";
import type { BattleState } from "./model.js";

const positive = z.number().int().positive().max(1_000_000);
export const objectiveRulesSchema = z
  .strictObject({
    experimental: z.literal(true),
    captureTicks: positive,
    radiusUnits: positive,
    scoreEveryTicks: positive,
    targetScore: positive,
    limitTicks: positive,
    points: z
      .array(
        z.strictObject({
          id: z.string().min(1),
          name: z.string().min(1),
          position: z.strictObject({
            x: z.number().int().min(0).max(100_000),
            y: z.number().int().min(0).max(100_000),
          }),
          opensAtTick: z.number().int().nonnegative().max(1_000_000),
          score: positive,
        }),
      )
      .min(1)
      .max(7),
  })
  .refine(
    (r) => new Set(r.points.map((p) => p.id)).size === r.points.length,
    "Duplicate objective ID",
  );
export type ObjectiveRules = z.infer<typeof objectiveRulesSchema>;
export interface ObjectivePoint {
  id: string;
  name: string;
  position: { x: number; y: number };
  owner: string | null;
  capturing: string | null;
  progressTicks: number;
  contested: boolean;
  open: boolean;
  opensAtTick: number;
  score: number;
}
export interface ObjectiveResult {
  winner: string | null;
  reason: "score" | "time" | "abandoned";
  tick: number;
  scores: Record<string, number>;
}
export interface ObjectiveMatchState {
  experimental: true;
  tick: number;
  limitTicks: number;
  targetScore: number;
  captureTicks: number;
  radiusUnits: number;
  scoreEveryTicks: number;
  status: "running" | "finished";
  scores: Record<string, number>;
  points: ObjectivePoint[];
  result: ObjectiveResult | null;
}
export function createObjectiveMatch(
  rules: ObjectiveRules,
  nations: string[],
): ObjectiveMatchState {
  objectiveRulesSchema.parse(rules);
  if (nations.length < 2 || new Set(nations).size !== nations.length)
    throw new Error("Invalid nations");
  return {
    experimental: true,
    tick: 0,
    limitTicks: rules.limitTicks,
    targetScore: rules.targetScore,
    captureTicks: rules.captureTicks,
    radiusUnits: rules.radiusUnits,
    scoreEveryTicks: rules.scoreEveryTicks,
    status: "running",
    scores: Object.fromEntries(nations.map((id) => [id, 0])),
    points: rules.points.map((p) => ({
      id: p.id,
      name: p.name,
      position: { ...p.position },
      owner: null,
      capturing: null,
      progressTicks: 0,
      contested: false,
      open: p.opensAtTick === 0,
      opensAtTick: p.opensAtTick,
      score: p.score,
    })),
    result: null,
  };
}
export function finishObjectiveMatch(
  state: ObjectiveMatchState,
  reason: ObjectiveResult["reason"],
): ObjectiveMatchState {
  if (state.status === "finished") return state;
  const next = structuredClone(state);
  const ranking = Object.entries(next.scores).sort((a, b) => b[1] - a[1]);
  next.status = "finished";
  next.result = {
    winner:
      reason === "abandoned" || ranking[0]![1] === ranking[1]![1]
        ? null
        : ranking[0]![0],
    reason,
    tick: next.tick,
    scores: { ...next.scores },
  };
  return next;
}
/** Pure, fixed-tick experimental objective rules. No client commands or wall clock. */
export function advanceObjectives(
  state: ObjectiveMatchState,
  battle: BattleState,
  rules: ObjectiveRules,
): ObjectiveMatchState {
  if (state.status === "finished") return state;
  if (battle.tick !== state.tick + 1)
    throw new Error("Objectives require consecutive battle ticks");
  let next = structuredClone(state);
  next.tick = battle.tick;
  next.points.forEach((point, index) => {
    const definition = rules.points[index]!;
    point.open = next.tick >= definition.opensAtTick;
    if (!point.open) return;
    const nations = [
      ...new Set(
        battle.squads
          .filter(
            (s) =>
              s.hpMilli > 0 &&
              s.morale > 0 &&
              s.cohesion > 0 &&
              s.fsmState !== "ROUTED" &&
              s.fsmState !== "BROKEN" &&
              s.fsmState !== "RETREAT" &&
              s.order?.type !== "RETREAT" &&
              Object.hasOwn(next.scores, s.nationId) &&
              (s.position.x - point.position.x) ** 2 +
                (s.position.y - point.position.y) ** 2 <=
                rules.radiusUnits ** 2,
          )
          .map((s) => s.nationId),
      ),
    ];
    point.contested = nations.length > 1;
    const candidate = nations.length === 1 ? nations[0]! : null;
    // Experimental: uninterrupted sole presence, no soldier-count advantage.
    if (!candidate || candidate === point.owner) {
      point.capturing = null;
      point.progressTicks = 0;
    } else {
      point.progressTicks =
        point.capturing === candidate ? point.progressTicks + 1 : 1;
      point.capturing = candidate;
      if (point.progressTicks >= rules.captureTicks) {
        point.owner = candidate;
        point.capturing = null;
        point.progressTicks = 0;
      }
    }
    // An enemy's presence suspends income even before a completed takeover.
    if (
      next.tick % rules.scoreEveryTicks === 0 &&
      point.owner &&
      !nations.some((n) => n !== point.owner)
    ) {
      next.scores[point.owner] = next.scores[point.owner]! + definition.score;
    }
  });
  // Apply all nations' income before deciding; simultaneous equal scores draw.
  if (Object.values(next.scores).some((score) => score >= rules.targetScore))
    next = finishObjectiveMatch(next, "score");
  else if (next.tick >= rules.limitTicks)
    next = finishObjectiveMatch(next, "time");
  return next;
}
