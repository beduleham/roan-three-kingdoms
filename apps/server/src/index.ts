import { defineRoom, defineServer } from "colyseus";
import { BattleRoom, Battle3v3Room } from "./room.js";

const server = defineServer({
  rooms: {
    battle_1v1: defineRoom(BattleRoom),
    battle_3v3: defineRoom(Battle3v3Room),
  },
});
const port = Number(process.env.PORT ?? 2567);
server.listen(port);
console.log(`Authoritative battle server listening on ${port}`);
