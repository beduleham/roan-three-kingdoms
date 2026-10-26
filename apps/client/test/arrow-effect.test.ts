import { describe, it, expect } from "vitest";
import { arrowPose, retainArrows, arrowPolicy } from "../src/arrow-effect.js";
import { project } from "../src/projection.js";
describe("event driven cosmetic arrows", () => {
  const f = { tick: 10, from: { x: 6000, y: 4000 }, to: { x: 14000, y: 4000 } };
  it("starts at source, arcs above the path and reaches the captured target", () => {
    const a = project(f.from),
      b = project(f.to);
    expect(arrowPose(f, 10)).toMatchObject({
      x: a.x,
      y: a.y - arrowPolicy.handHeightPixels,
    });
    expect(arrowPose(f, 12)!.y).toBeCloseTo(
      (a.y + b.y) / 2 - arrowPolicy.handHeightPixels - arrowPolicy.liftPixels,
    );
    expect(arrowPose(f, 14)).toMatchObject({
      x: b.x,
      y: b.y - arrowPolicy.handHeightPixels,
    });
  });
  it("does not display future hits or expired arrows", () => {
    expect(arrowPose(f, 9)).toBeNull();
    expect(arrowPose(f, 15)).toBeNull();
  });
  it("bounds retained effects without mutating the source list", () => {
    const flights = Array.from({ length: 70 }, (_, i) => ({
      ...f,
      from: { x: i, y: 0 },
    }));
    expect(retainArrows(flights, 10)).toHaveLength(64);
    expect(flights).toHaveLength(70);
    expect(retainArrows(flights, 15)).toEqual([]);
  });
  it("freezes at a fixed tick and does not move source or target", () => {
    const copy = structuredClone(f);
    expect(arrowPose(f, 12)).toEqual(arrowPose(f, 12));
    expect(f).toEqual(copy);
  });
});
