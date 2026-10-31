// Test-only accelerated growth/clock and injured units. Production never imports this entry.
import { defineRoom, defineServer } from "colyseus";
import { BattleRoom } from "../dist/room.js";
import { AuthoritativeMatch } from "../dist/match.js";
import { registerHttp } from "../dist/http.js";
import { readFileSync } from "node:fs";
const normal = JSON.parse(
  readFileSync(
    new URL("../../../national_demo.v1.json", import.meta.url),
    "utf8",
  ),
);
const rules = {
  ...normal,
  checkpoints: [100, 130, 161],
  gapBp: [10000, 10000, 0],
  unifyAfterTick: 1000,
  jobTicks: 2,
  holdXp: 1000,
  holdMerit: 3000,
  objectives: {
    ...normal.objectives,
    scoreEveryTicks: 5,
    limitTicks: 161,
    points: normal.objectives.points.map((p) => ({ ...p, opensAtTick: 1000 })),
  },
};
// Bases must be open for supply. Other points stay closed so this fixture draws at the final odd tick.
rules.objectives.points.forEach((p) => {
  if (Object.values(rules.bases).includes(p.id)) p.opensAtTick = 0;
});
class AcceptanceRoom extends BattleRoom {
  maxClients = 9;
  match = new AuthoritativeMatch("national", undefined, rules);
  onCreate(options) {
    this.match.state.squads
      .filter((s) => s.id.endsWith("-1"))
      .forEach((s) => (s.hpMilli -= 500000));
    return super.onCreate(options);
  }
}
defineServer({
  express: (app) => registerHttp(app),
  rooms: { battle_national: defineRoom(AcceptanceRoom) },
}).listen(4188);
