import { loadBattleConfig } from "./node.js";
import { compareExperimentalAugments } from "./experimental-scenario.js";
const report = compareExperimentalAugments(
  loadBattleConfig(new URL("../../../battle_config.v1.json", import.meta.url)),
);
if (report.cases.some((c) => !c.replayMatches))
  throw new Error("Experimental replay mismatch");
console.log(JSON.stringify(report));
