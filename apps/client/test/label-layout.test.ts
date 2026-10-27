import { expect, it } from "vitest";
import { layoutLabels } from "../src/label-layout.js";
const viewport = { x: 0, y: 0, width: 960, height: 560 };
const anchor = (id: string, selected = false) => ({
  id,
  x: 400,
  y: 300,
  width: 180,
  height: 24,
  selected,
});
it("separates coincident squads and keeps selected labels nearest their anchor", () => {
  const result = layoutLabels(
    [anchor("b"), anchor("a", true), anchor("c"), anchor("d")],
    viewport,
  );
  expect(result).toHaveLength(4);
  expect(result[0]).toMatchObject({ id: "a", y: 210 });
  for (const [i, a] of result.entries())
    for (const b of result.slice(i + 1))
      expect(a.y + a.height <= b.y || b.y + b.height <= a.y).toBe(true);
});
it("clamps labels to the scrolled viewport and omits offscreen squads", () => {
  const view = { x: 300, y: 200, width: 320, height: 200 };
  const result = layoutLabels(
    [
      { ...anchor("edge"), x: 301, y: 201 },
      { ...anchor("off"), x: 299 },
    ],
    view,
  );
  expect(result).toEqual([
    { id: "edge", x: 308, y: 208, width: 180, height: 24 },
  ]);
});
it("is independent of input order and does not mutate anchors", () => {
  const input = [anchor("b"), anchor("a")];
  const copy = structuredClone(input);
  expect(layoutLabels(input, viewport)).toEqual(
    layoutLabels([...input].reverse(), viewport),
  );
  expect(input).toEqual(copy);
});
it("retains selected labels if the viewport cannot fit all labels", () => {
  const result = layoutLabels([anchor("b"), anchor("a", true)], {
    x: 300,
    y: 280,
    width: 200,
    height: 40,
  });
  expect(result.map((r) => r.id)).toEqual(["a"]);
});
