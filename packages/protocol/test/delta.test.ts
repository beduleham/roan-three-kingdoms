import { describe, expect, it } from "vitest";
import {
  applyStateDelta,
  applyVerifiedDelta,
  diffState,
} from "../src/index.js";

describe("state delta", () => {
  it("round trips changed and removed fields without mutating the base", () => {
    const before = {
      tick: 2,
      squads: [{ hp: 10, position: { x: 3, y: 4 } }],
      extra: "old",
    };
    const after = {
      tick: 4,
      squads: [{ hp: 9, position: { x: 5, y: 4 } }],
      fresh: true,
    };
    const changes = diffState(before, after);
    expect(changes).toContainEqual({
      path: ["squads", 0, "position", "x"],
      value: 5,
    });
    expect(applyStateDelta(before, changes)).toEqual(after);
    expect(before.squads[0]?.position.x).toBe(3);
  });
  it("replaces arrays when their length changes and rejects invalid paths", () => {
    expect(
      applyStateDelta(
        { list: [1] },
        diffState({ list: [1] }, { list: [1, 2] }),
      ),
    ).toEqual({ list: [1, 2] });
    expect(() =>
      applyStateDelta({ list: [] }, [{ path: ["missing", 0], value: 1 }]),
    ).toThrow("Invalid delta path");
  });
  it("rejects a missed, corrupted or stale patch and recovers from a full snapshot", () => {
    const initial = { tick: 0, hp: 100 };
    const middle = { tick: 2, hp: 90 };
    const final = { tick: 4, hp: 80 };
    const patch = {
      baseTick: 2,
      tick: 4,
      hash: JSON.stringify(final),
      changes: diffState(middle, final),
    };
    expect(applyVerifiedDelta(initial, patch, JSON.stringify)).toBeNull();
    expect(
      applyVerifiedDelta(middle, { ...patch, hash: "corrupt" }, JSON.stringify),
    ).toBeNull();
    expect(
      applyVerifiedDelta(middle, { ...patch, tick: 2 }, JSON.stringify),
    ).toBeNull();
    expect(
      applyVerifiedDelta(
        middle,
        { ...patch, changes: [{ path: ["missing", "hp"], value: 1 }] },
        JSON.stringify,
      ),
    ).toBeNull();
    expect(
      applyVerifiedDelta(structuredClone(middle), patch, JSON.stringify),
    ).toEqual(final);
    expect(middle).toEqual({ tick: 2, hp: 90 });
  });
});
