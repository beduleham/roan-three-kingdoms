import { labelPolicy } from "../src/label-layout.js";
import { expect, it } from "vitest";
import { formationView, soldierFoot } from "../src/formation-view.js";
it("reserves the center lane for a commander with eight distinct soldier slots", () => {
  const feet = Array.from({ length: 8 }, (_, i) =>
    soldierFoot({ x: 0, y: 0 }, i),
  );
  expect(new Set(feet.map((p) => `${p.x}:${p.y}`)).size).toBe(8);
  expect(feet.every((p) => Math.abs(p.x) >= 40)).toBe(true);
  expect(
    feet.every(
      (p) =>
        Math.abs(p.x) < formationView.halfWidth && p.y < formationView.bottom,
    ),
  ).toBe(true);
});
it("translates display positions without changing the squad center", () => {
  const center = { x: 310, y: 180 };
  expect(soldierFoot(center, 0)).toEqual({ x: 244, y: 166 });
  expect(center).toEqual({ x: 310, y: 180 });
  expect(() => soldierFoot(center, 8)).toThrow(RangeError);
});

it("leaves space between the usual nameplate and commander badge", () => {
  expect(-labelPolicy.lift + 30).toBeLessThan(
    formationView.commanderBadgeY - 7,
  );
});
