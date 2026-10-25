import type { BattleInput, BattleState } from "./model.js";
import { step } from "./battle.js";

import { canonicalJson } from "./canonical.js";
export { canonicalJson } from "./canonical.js";
/** FNV-1a 64-bit over canonical JSON UTF-16 code units; regression fingerprint, not cryptography. */
export function hashReplayValue(value: unknown): string {
  let hash = 0xcbf29ce484222325n;
  const json = canonicalJson(value);
  for (let i = 0; i < json.length; i++)
    hash = BigInt.asUintN(
      64,
      (hash ^ BigInt(json.charCodeAt(i))) * 0x100000001b3n,
    );
  return hash.toString(16).padStart(16, "0");
}
export function replay(
  initial: BattleState,
  frames: readonly (readonly BattleInput[])[],
) {
  let state = initial;
  const events = [];
  for (const commands of frames) {
    const result = step(state, commands);
    state = result.state;
    events.push(...result.events);
  }
  return {
    state,
    events,
    stateHash: hashReplayValue(state),
    eventHash: hashReplayValue(events),
  };
}
