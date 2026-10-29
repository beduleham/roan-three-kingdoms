import { describe, expect, it } from "vitest";
import rawConfig from "../../../battle_config.v1.json";
import {
  parseBattleConfig,
  replay,
  hashReplayValue,
} from "../../../packages/battle-core/src/index.js";
import { LocalSession } from "../src/session.js";
import { commandResultTicks, replayAtTick } from "../src/replay-seek.js";

describe("recorded timeline seeking", () => {
  it("indexes only processed command ticks", () => {
    const session = new LocalSession(parseBattleConfig(rawConfig));
    session.send({
      type: "SET_STANCE",
      squadIds: ["human-1"],
      stance: "aggressive",
    });
    session.togglePause();
    session.advance(session.config.tickMs);
    session.advance(session.config.tickMs);
    expect(commandResultTicks(session.frames)).toEqual([1]);
    expect(
      replayAtTick(session.frames, new Map([[0, session.initial]]), 1),
    ).toEqual(replay(session.initial, session.frames.slice(0, 1)).state);
  });
  it("returns the same states when seeking backward and across checkpoints", () => {
    const session = new LocalSession(parseBattleConfig(rawConfig));
    session.togglePause();
    session.advance(session.config.tickMs * 120);
    // Advance is deliberately bounded to ten ticks per render frame.
    for (let i = 0; i < 12; i++) session.advance(session.config.tickMs * 10);
    const checkpoints = new Map([[0, session.initial]]);
    for (const tick of [105, 3, 120, 0, 100]) {
      const state = replayAtTick(session.frames, checkpoints, tick);
      expect(hashReplayValue(state)).toBe(
        hashReplayValue(
          replay(session.initial, session.frames.slice(0, tick)).state,
        ),
      );
    }
    expect(replayAtTick(session.frames, checkpoints, -1)).toBeNull();
    expect(
      replayAtTick(session.frames, checkpoints, session.frames.length + 1),
    ).toBeNull();
  });
});
