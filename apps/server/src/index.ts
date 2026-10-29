import { defineRoom, defineServer } from "colyseus";
import { BattleRoom } from "./room.js";

const server = defineServer({ rooms: { battle_1v1: defineRoom(BattleRoom) } });
const port = Number(process.env.PORT ?? 2567);
server.listen(port);
console.log(`Authoritative battle server listening on ${port}`);
