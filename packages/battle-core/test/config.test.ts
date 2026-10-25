import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseBattleConfig } from "../src/index.js";
import { loadBattleConfig } from "../src/node.js";

const path = new URL("../../../battle_config.v1.json", import.meta.url);
const original = JSON.parse(readFileSync(path, "utf8"));

describe("Phase 0 config loading and validation", () => {
  it("accepts the complete repository config without changing values", () => {
    expect(loadBattleConfig(path)).toEqual(original);
    expect(parseBattleConfig(original)).not.toBe(original);
  });

  it("keeps design metadata separate from battle status settings", () => {
    const parsed = loadBattleConfig(path);
    expect(parsed.designStatus).toBe("design-assumptions-not-validated");
    expect(parsed.status.routTicks).toBe(40);
    const { designStatus: _, ...missing } = original;
    expect(() => parseBattleConfig(missing)).toThrow("designStatus");
    expect(() =>
      parseBattleConfig({ ...original, status: original.designStatus }),
    ).toThrow("status");
  });

  it.each([
    [
      "missing tick",
      (c: any) => {
        delete c.tickMs;
      },
      "tickMs",
    ],
    [
      "fractional tick",
      (c: any) => {
        c.tickMs = 0.5;
      },
      "tickMs",
    ],
    [
      "negative damage",
      (c: any) => {
        c.unitTypes.infantry.dpsPerSoldier = -1;
      },
      "unitTypes.infantry.dpsPerSoldier",
    ],
    [
      "missing matchup",
      (c: any) => {
        delete c.matchupBp.spears.cavalry;
      },
      "matchupBp.spears.cavalry",
    ],
    [
      "wrong type",
      (c: any) => {
        c.commander.baseHp = "450";
      },
      "commander.baseHp",
    ],
    [
      "invalid percentage",
      (c: any) => {
        c.status.routRecoveryMorale = 101;
      },
      "status.routRecoveryMorale",
    ],
    [
      "invalid BP fraction",
      (c: any) => {
        c.baseEngagementBp = 10001;
      },
      "baseEngagementBp",
    ],
    [
      "duplicate levels",
      (c: any) => {
        c.augmentLevels = [5, 5];
      },
      "augmentLevels",
    ],
    [
      "wrong threshold order",
      (c: any) => {
        c.moraleBands.normalFrom = 1;
      },
      "moraleBands",
    ],
    [
      "unknown field",
      (c: any) => {
        c.typo = true;
      },
      "Invalid battle config",
    ],
    [
      "nonfinite value",
      (c: any) => {
        c.unitTypes.archers.rangeTiles = Infinity;
      },
      "unitTypes.archers.rangeTiles",
    ],
  ])("rejects %s with a useful field error", (_, mutate, message) => {
    const config = structuredClone(original);
    mutate(config);
    expect(() => parseBattleConfig(config)).toThrow(message);
  });

  it.each([null, [], "config", 42])("rejects non-object input %j", (input) => {
    expect(() => parseBattleConfig(input)).toThrow("Invalid battle config");
  });

  it("reports missing files", () => {
    expect(() =>
      loadBattleConfig(new URL("./missing.json", import.meta.url)),
    ).toThrow("Unable to load battle config");
  });
});
