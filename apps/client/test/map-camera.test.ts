import { describe, expect, it } from "vitest";
import { createMapCamera, worldToMap, mapToWorld } from "../src/map-camera.js";
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
