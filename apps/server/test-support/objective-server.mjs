// Test-only short clock. The production entry never imports this file.
import { defineRoom, defineServer } from "colyseus";
import { BattleRoom } from "../dist/room.js";
import { AuthoritativeMatch } from "../dist/match.js";
import { registerHttp } from "../dist/http.js";
import { readFileSync } from "node:fs";
const normal = JSON.parse(
  readFileSync(
    new URL("../../../objective_demo.v1.json", import.meta.url),
    "utf8",
  ),
);
class AcceptanceRoom extends BattleRoom {
  match = new AuthoritativeMatch("objectives", {
    ...normal,
    captureTicks: 2,
    scoreEveryTicks: 5,
    targetScore: 2,
    limitTicks: 61,
  });
}
defineServer({
  express: (app) => registerHttp(app),
  rooms: { battle_objectives: defineRoom(AcceptanceRoom) },
}).listen(Number(process.env.PORT ?? 4186));
