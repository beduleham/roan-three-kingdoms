import { step } from "../../../packages/battle-core/src/index.js";
import type {
  BattleInput,
  BattleState,
} from "../../../packages/battle-core/src/index.js";

/** Deterministic, read-only projection of an imported log at a tick boundary. */
export function replayAtTick(
  frames: readonly (readonly BattleInput[])[],
  checkpoints: Map<number, BattleState>,
  target: number,
): BattleState | null {
  if (
    !Number.isInteger(target) ||
    target < 0 ||
    target > frames.length ||
    !checkpoints.size
  )
    return null;
  let index = Math.floor(target / 100) * 100;
  while (!checkpoints.has(index)) index -= 100;
  let state = checkpoints.get(index)!;
  for (; index < target; index++) {
    state = step(state, frames[index]!).state;
    if ((index + 1) % 100 === 0) checkpoints.set(index + 1, state);
  }
  return state;
}
