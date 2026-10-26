import { describe, it, expect } from "vitest";
import { project, unproject, groundRing } from "../src/projection.js";
describe("quarter-view input mapping", () => {
  it("round trips integer simulation coordinates including offscreen and negative positions", () => {
    for (const p of [
      { x: 0, y: 0 },
      { x: 6000, y: 4000 },
      { x: 14000, y: 9000 },
      { x: -2345, y: 37621 },
    ])
      expect(unproject(project(p))).toEqual(p);
  });
  it("inverse mapping accepts fractional screen coordinates within half a core unit", () => {
    const p = { x: 1234.4, y: -4567.3 },
      back = unproject(project(p));
    expect(Math.abs(back.x - p.x)).toBeLessThanOrEqual(0.5);
    expect(Math.abs(back.y - p.y)).toBeLessThanOrEqual(0.5);
  });
  it("projects range circles into closed ellipses without changing source state", () => {
    const p = { x: 6000, y: 4000 },
      points = groundRing(p, 1000);
    expect(points[0]!.x).toBeCloseTo(points.at(-1)!.x);
    expect(points[0]!.y).toBeCloseTo(points.at(-1)!.y);
    expect(p).toEqual({ x: 6000, y: 4000 });
    for (const v of points) {
      const q = unproject(v);
      expect(Math.hypot(q.x - p.x, q.y - p.y)).toBeCloseTo(1000, 0);
    }
  });
});
