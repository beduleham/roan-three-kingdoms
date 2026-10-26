import { describe, it, expect } from "vitest";
import { directionRow, spearPose } from "../src/unit-motion.js";
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
