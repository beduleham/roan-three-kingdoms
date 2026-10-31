import { it, expect } from "vitest";
import { remainingMatchTicks } from "../src/match-clock.js";
it("counts to the current national checkpoint rather than the maximum 21min limit", () => {
  expect(
    remainingMatchTicks(
      { tick: 1000, limitTicks: 12600, status: "running" },
      9000,
    ),
  ).toBe(8000);
});
it("preserves the legacy objective deadline", () => {
  expect(
    remainingMatchTicks({ tick: 100, limitTicks: 600, status: "running" }),
  ).toBe(500);
});
it("zeros early unification, score wins and abandoned matches", () => {
  expect(
    remainingMatchTicks(
      { tick: 6449, limitTicks: 12600, status: "finished" },
      9000,
    ),
  ).toBe(0);
  expect(
    remainingMatchTicks({ tick: 10, limitTicks: 600, status: "finished" }),
  ).toBe(0);
});
it("never displays a negative countdown", () => {
  expect(
    remainingMatchTicks({ tick: 100, limitTicks: 60, status: "running" }),
  ).toBe(0);
});
