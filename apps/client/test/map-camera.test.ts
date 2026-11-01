import { describe, expect, it } from "vitest";
import {
  createMapCamera,
  createIsometricCamera,
  projectedRadius,
  viewportCorners,
  worldToMap,
  mapToWorld,
} from "../src/map-camera.js";
const world = { x: 24000, y: 13000 };
describe("shared world camera", () => {
  it.each([
    { x: 720, y: 420 },
    { x: 300, y: 180 },
    { x: 360, y: 600 },
  ])(
    "round trips world positions across overview and battle aspect ratios %j",
    (pixels) => {
      for (const zoom of [1, 2]) {
        const c = createMapCamera(
          world,
          pixels,
          zoom,
          { x: 12000, y: 6500 },
          12,
        );
        for (const point of [
          { x: c.left, y: c.top },
          { x: c.left + c.width / 2, y: c.top + c.height / 2 },
          { x: c.left + c.width, y: c.top + c.height },
        ]) {
          const restored = mapToWorld(worldToMap(point, c), c)!;
          expect(restored.x).toBeCloseTo(point.x);
          expect(restored.y).toBeCloseTo(point.y);
        }
      }
    },
  );
  it("clamps focus to world edges while keeping the requested battle zoom", () => {
    const near = createMapCamera(
        world,
        { x: 720, y: 420 },
        2,
        { x: -5000, y: -8000 },
        24,
      ),
      far = createMapCamera(
        world,
        { x: 720, y: 420 },
        2,
        { x: 999999, y: 999999 },
        24,
      );
    expect([near.left, near.top]).toEqual([0, 0]);
    expect(far.left + far.width).toBe(24000);
    expect(far.top + far.height).toBe(13000);
    expect(far.width).toBe(12000);
  });
  it("ignores letterbox margins instead of converting them into orders", () => {
    const c = createMapCamera(world, { x: 720, y: 420 }, 1, { x: 0, y: 0 }, 24);
    expect(mapToWorld({ x: 1, y: 1 }, c)).toBeNull();
    expect(mapToWorld({ x: 719, y: 419 }, c)).toBeNull();
  });
  it("uses one world coordinate in two views without mutating it", () => {
    const point = Object.freeze({ x: 8000, y: 3000 }),
      overview = createMapCamera(world, { x: 300, y: 180 }, 1, point, 12),
      battle = createMapCamera(world, { x: 720, y: 420 }, 2, point, 24);
    expect(worldToMap(point, overview)).not.toEqual(worldToMap(point, battle));
    expect(mapToWorld(worldToMap(point, battle), battle)).toEqual(point);
  });
  it("rejects nonfinite or unusable view dimensions", () => {
    for (const pixels of [
      { x: 0, y: 0 },
      { x: 40, y: 40 },
    ])
      expect(() =>
        createMapCamera(world, pixels, 2, { x: 0, y: 0 }, 24),
      ).toThrow();
    expect(() =>
      createMapCamera(world, { x: 720, y: 420 }, 0, { x: 0, y: 0 }, 24),
    ).toThrow();
    expect(() =>
      createMapCamera(world, { x: 720, y: 420 }, 2, { x: NaN, y: 0 }, 24),
    ).toThrow();
  });
});

describe("online isometric camera", () => {
  it.each([1, 2, 3])(
    "round trips world corners and interior through zoom %i without changing world bounds",
    (zoom) => {
      const c = createIsometricCamera(
        world,
        { x: 720, y: 420 },
        zoom,
        { x: 13000, y: 8000 },
        24,
      );
      const points = [
        { x: c.left, y: c.top },
        { x: c.left + c.width, y: c.top + c.height },
        { x: c.left + c.width / 2, y: c.top + c.height / 2 },
        { x: c.left + c.width * 0.2, y: c.top + c.height * 0.7 },
      ];
      for (const p of points) {
        const back = mapToWorld(worldToMap(p, c), c)!;
        expect(back.x).toBeCloseTo(p.x, 6);
        expect(back.y).toBeCloseTo(p.y, 6);
      }
      for (const p of viewportCorners(c)) {
        expect(p.x).toBeGreaterThanOrEqual(23.99);
        expect(p.x).toBeLessThanOrEqual(696.01);
        expect(p.y).toBeGreaterThanOrEqual(23.99);
        expect(p.y).toBeLessThanOrEqual(396.01);
      }
    },
  );
  it("rejects diamond margins and non-finite clicks, and projects circular ranges to an ellipse", () => {
    const c = createIsometricCamera(
      world,
      { x: 720, y: 420 },
      1,
      { x: 12000, y: 6500 },
      24,
    );
    expect(mapToWorld({ x: 24, y: 24 }, c)).toBeNull();
    expect(mapToWorld({ x: NaN, y: 24 }, c)).toBeNull();
    const r = projectedRadius(1000, c);
    expect(r.x / r.y).toBeCloseTo(2);
    const center = worldToMap({ x: 12000, y: 6500 }, c),
      edge = worldToMap(
        { x: 12000 + 1000 / Math.SQRT2, y: 6500 - 1000 / Math.SQRT2 },
        c,
      );
    expect(edge.x - center.x).toBeCloseTo(r.x);
    expect(edge.y).toBeCloseTo(center.y);
  });
});
