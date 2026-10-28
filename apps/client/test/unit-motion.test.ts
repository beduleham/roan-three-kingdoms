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
  it("starts each actual attack from its first frame", () => {
    expect(spearPose({ x: 0, y: 1 }, 4, false, 4)).toMatchObject({
      texture: "spear-attack",
      frame: 4,
    });
    expect(spearPose({ x: 0, y: 1 }, 6, false, 6).frame).toBe(4);
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

import { footPose } from "../src/unit-motion.js";
for (const kind of ["infantry", "archers"] as const) {
  describe(`${kind} directional animation`, () => {
    it.each([
      [1, 0, 0],
      [0, 1, 1],
      [-1, 0, 2],
      [0, -1, 3],
    ])("facing %i,%i uses row %i", (x, y, row) =>
      expect(footPose(kind, { x, y }, 0, false).frame).toBe(row * 4),
    );
    it("selects walk, idle, and actual recent attack without changing heading", () => {
      const prefix = kind === "archers" ? "archer" : "infantry";
      expect(footPose(kind, { x: 0, y: 1 }, 2, true)).toMatchObject({
        texture: `${prefix}-walk`,
        mode: "walk",
        frame: 5,
      });
      expect(footPose(kind, { x: 0, y: 1 }, 2, false, 2)).toMatchObject({
        texture: `${prefix}-attack`,
        mode: "attack",
        frame: 4,
      });
      expect(footPose(kind, { x: 0, y: 1 }, 2, false, 3).mode).toBe("idle");
    });
  });
}

for (const kind of ["spears", "infantry", "archers"] as const) {
  describe(`${kind} complete attack sequence`, () => {
    it.each([0, 1, 2, 3, 4, 5, 6, 7])(
      "plays frames 0..3 after a hit at global phase %i",
      (phase) => {
        const hit = 32 + phase;
        for (const facing of [
          { x: 1, y: 0 },
          { x: 0, y: 1 },
          { x: -1, y: 0 },
          { x: 0, y: -1 },
        ]) {
          const row = directionRow(facing);
          expect(
            Array.from(
              { length: 4 },
              (_, age) => footPose(kind, facing, hit + age, true, hit).frame,
            ),
          ).toEqual([0, 1, 2, 3].map((frame) => row * 4 + frame));
          expect(footPose(kind, facing, hit + 4, true, hit).mode).toBe("walk");
          expect(footPose(kind, facing, hit + 4, false, hit).mode).toBe("idle");
        }
      },
    );
    it("keeps the current attack phase and ignores old hits after reset", () => {
      const facing = { x: 1, y: 0 };
      expect(footPose(kind, facing, 42, false, 40)).toMatchObject({
        frame: 2,
        mode: "attack",
      });
      expect(footPose(kind, facing, 0, false, 40).mode).toBe("idle");
      expect(footPose(kind, facing, 43, false, 43).frame).toBe(0);
    });
  });
}

import { observeAttack } from "../src/unit-motion.js";
describe("per-tick attack event grouping", () => {
  it("starts on the observed simulation tick rather than the preceding event tick", () => {
    expect(observeAttack(undefined, 9, 10, { x: 1, y: 0 })).toEqual({
      startTick: 10,
      lastEventTick: 9,
      facing: { x: 1, y: 0 },
    });
  });
  it("finishes the clip during continuous damage and locks the heading", () => {
    let sample = observeAttack(undefined, 9, 10, { x: 1, y: 0 });
    const frames = [];
    for (let tick = 10; tick <= 17; tick++) {
      sample = observeAttack(sample, tick - 1, tick, { x: 0, y: 1 });
      frames.push(
        footPose("infantry", sample!.facing, tick, false, sample!.startTick)
          .frame,
      );
    }
    expect(frames).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
  });
  it("does not repeat a consumed event or loop after attacks stop", () => {
    const sample = observeAttack(undefined, 9, 10, { x: 1, y: 0 });
    const after = observeAttack(sample, 9, 20, { x: 0, y: 1 });
    expect(after).toEqual(sample);
    expect(
      footPose("infantry", after!.facing, 20, false, after!.startTick).mode,
    ).toBe("idle");
    expect(observeAttack(sample, 30, 11, { x: 1, y: 0 })).toEqual(sample);
  });
  it("resets on a lower tick and copies the supplied facing", () => {
    const facing = { x: 1, y: 0 };
    const sample = observeAttack(undefined, 9, 10, facing);
    facing.x = -1;
    expect(sample!.facing.x).toBe(1);
    expect(observeAttack(sample, 0, 1, facing)).toMatchObject({
      startTick: 1,
      lastEventTick: 0,
    });
  });
});
