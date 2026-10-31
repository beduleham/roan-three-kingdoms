import { defineRoom, defineServer } from "colyseus";
import { BattleRoom, Battle3v3Room } from "./room.js";
import { accountAuth } from "./auth.js";
import { registerHttp } from "./http.js";
import { SqliteAccountRepository } from "./accounts.js";
import { resolve } from "node:path";

const accounts = new SqliteAccountRepository(
  process.env.ACCOUNT_DB_PATH?.trim() || resolve("data/accounts.sqlite"),
);
accountAuth.initializeAccounts(accounts);

const server = defineServer({
  express: (app) => registerHttp(app),
  rooms: {
    battle_1v1: defineRoom(BattleRoom),
    battle_3v3: defineRoom(Battle3v3Room),
  },
});
const port = Number(process.env.PORT ?? 2567);
server.onShutdown(() => accounts.close());
server.listen(port);
console.log(`Authoritative battle server listening on ${port}`);
