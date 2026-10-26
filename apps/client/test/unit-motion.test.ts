import { describe, it, expect } from "vitest";
import {
  directionRow,
  spearPose,
  mountedPose,
  observeMotion,
} from "../src/unit-motion.js";
describe("sprite motion policy", () => {
  it.each([
    [1, 0, 0],
    [0, 1, 1],
    [-1, 0, 2],
    [0, -1, 3],
    [1, 1, 0],
    [-1, 1, 1],
    [-1, -1, 3],
    [1, -1, 0],
  ])("maps core facing (%i,%i) to sheet row %i", (x, y, row) =>
    expect(directionRow({ x, y })).toBe(row),
  );
  it("holds idle pose and advances movement from simulation ticks", () => {
    expect(spearPose({ x: 1, y: 0 }, 3, false).frame).toBe(0);
    expect(spearPose({ x: 1, y: 0 }, 2, true).frame).toBe(1);
    expect(spearPose({ x: 1, y: 0 }, 4, true).frame).toBe(2);
  });
  it("uses real recent hit for attack and does not reset phase on repeated hits", () => {
    expect(spearPose({ x: 0, y: 1 }, 4, false, 4)).toMatchObject({
      texture: "spear-attack",
      frame: 6,
    });
    expect(spearPose({ x: 0, y: 1 }, 6, false, 6).frame).toBe(7);
  });
  it("ignores future or expired hits", () => {
    expect(spearPose({ x: 1, y: 0 }, 4, false, 5).mode).toBe("idle");
    expect(spearPose({ x: 1, y: 0 }, 8, false, 4).mode).toBe("idle");
  });
  it("is stable when tick does not advance and does not mutate inputs", () => {
    const facing = { x: 1, y: 0 };
    const p = spearPose(facing, 6, true);
    expect(spearPose(facing, 6, true)).toEqual(p);
    expect(facing).toEqual({ x: 1, y: 0 });
  });
});

describe("mounted presentation", () => {
  it.each([
    [1, 0, 0],
    [0, 1, 1],
    [-1, 0, 2],
    [0, -1, 3],
  ])("mounted facing %i,%i selects row %i", (x, y, row) =>
    expect(mountedPose({ x, y }, 0, false, false, "cavalry").frame).toBe(
      row * 4,
    ),
  );
  it("canter uses slower cadence than an actual moving charge", () => {
    expect(
      mountedPose({ x: 1, y: 0 }, 3, true, false, "cavalry"),
    ).toMatchObject({ frame: 1, mode: "canter" });
    expect(
      mountedPose({ x: 1, y: 0 }, 3, true, true, "commander"),
    ).toMatchObject({ texture: "commander-canter", frame: 3, mode: "charge" });
  });
  it("does not animate a stationary unit solely because charge flag is set", () =>
    expect(
      mountedPose({ x: 1, y: 0 }, 3, false, true, "cavalry"),
    ).toMatchObject({ frame: 0, mode: "idle" }));
  it("observes actual movement and keeps the same sample during paused frames", () => {
    const a = observeMotion(undefined, { x: 10, y: 20 }, 0),
      b = observeMotion(a, { x: 15, y: 30 }, 1);
    expect(b).toMatchObject({ moving: true, dx: 5, dy: 10 });
    expect(observeMotion(b, { x: 15, y: 30 }, 1)).toEqual(b);
    expect(observeMotion(b, { x: 15, y: 30 }, 2).moving).toBe(false);
    expect(a).toMatchObject({ x: 10, y: 20, moving: false });
  });
  it("drops old movement after the tick resets", () => {
    const previous = { x: 10, y: 20, tick: 10, moving: true, dx: 1, dy: 2 };
    expect(observeMotion(previous, { x: 0, y: 0 }, 0)).toEqual({
      x: 0,
      y: 0,
      tick: 0,
      moving: false,
      dx: 0,
      dy: 0,
    });
  });
});
