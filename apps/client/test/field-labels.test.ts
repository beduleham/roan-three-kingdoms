import { describe, expect, it } from "vitest";
import { placeFieldLabels } from "../src/field-labels.js";

describe("field labels", () => {
  it("separates labels for overlapping enemy and allied units without moving units", () => {
    const input = ["blue-1", "red-1", "red-2"].map((text) => ({
      text,
      x: 400,
      y: 200,
      width: 50,
    }));
    const placed = placeFieldLabels(input, 720, 420);
    expect(new Set(placed.map((p) => p.box.y)).size).toBe(3);
    for (const label of placed) {
      expect(label.x).toBe(400);
      expect(label.y).toBe(200);
      expect(label.box.x).toBeGreaterThan(418);
    }
  });
  it("keeps long last-observation labels inside every canvas edge", () => {
    const placed = placeFieldLabels(
      [
        {
          text: "? red-1 · 12345tick",
          x: 710,
          y: 415,
          width: 160,
          memory: true,
        },
      ],
      720,
      420,
    );
    const { box } = placed[0]!;
    expect(box.x).toBeGreaterThanOrEqual(4);
    expect(box.x + box.width).toBeLessThanOrEqual(716);
    expect(box.y + box.height).toBeLessThanOrEqual(416);
    expect(placed[0]!.memory).toBe(true);
    expect(placed).toHaveLength(1);
  });
});
