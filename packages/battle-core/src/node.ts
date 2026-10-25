import { readFileSync } from "node:fs";
import { parseBattleConfig, type BattleConfig } from "./config.js";

export function loadBattleConfig(path: string | URL): BattleConfig {
  let input: unknown;
  try {
    input = JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    throw new Error("Unable to load battle config", { cause: error });
  }
  return parseBattleConfig(input);
}
