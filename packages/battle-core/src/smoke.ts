import { loadBattleConfig } from "./node.js";
const config = loadBattleConfig(
  new URL("../../../battle_config.v1.json", import.meta.url),
);
console.log(
  JSON.stringify({
    phase: 0,
    configLoaded: true,
    schemaVersion: config.schemaVersion,
    unitTypes: Object.keys(config.unitTypes),
    simulationImplemented: false,
  }),
);
