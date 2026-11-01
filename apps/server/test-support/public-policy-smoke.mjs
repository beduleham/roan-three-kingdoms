// Explicit smoke against one isolated private guest room. Does not certify gameplay balance.
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { Client } from "@colyseus/sdk";
import { applyVerifiedDelta } from "@roan/protocol";
import { hashReplayValue } from "../../../packages/battle-core/dist/index.js";
const base = new URL(process.env.DEMO_URL ?? "http://127.0.0.1:4194");
assert(
  base.protocol === "https:" ||
    (base.protocol === "http:" &&
      ["localhost", "127.0.0.1"].includes(base.hostname)),
  "Use HTTPS for remote hosts",
);
const peers = [];
let failure;
const delay = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(check) {
  const end = performance.now() + 20000;
  while (!check()) {
    if (failure) throw failure;
    assert(performance.now() < end, "Policy smoke timed out");
    await delay(25);
  }
}
function observe(room) {
  const p = { room, state: null, seat: "", key: "", denied: "" };
  peers.push(p);
  room.onMessage("*", () => {});
  room.onMessage("seat", (m) => (p.seat = m.seat));
  room.onMessage("invite-key", (m) => (p.key = m.key));
  room.onMessage("snapshot", (m) => (p.state = m.state));
  room.onMessage("command-result", (m) => {
    if (!m.accepted) p.denied = m.reason;
  });
  room.onMessage("delta", (d) => {
    const next = p.state && applyVerifiedDelta(p.state, d, hashReplayValue);
    if (next) p.state = next;
    else if (p.state?.tick === d.baseTick)
      failure = new Error("Invalid verified delta at the expected base tick");
    else room.send("hello");
  });
  room.onError((code, message) => (failure = new Error(`${code}: ${message}`)));
  room.send("hello");
  return p;
}
try {
  const api = new Client(base.origin.replace(/^http/, "ws"));
  const blue = observe(
    await api.create("battle_national", {
      inviteOnly: true,
      creatorProof: randomBytes(32).toString("hex"),
      seed: 0,
      policy: { version: "spoof", homePresenceRewards: true },
    }),
  );
  await until(() => blue.key && blue.state);
  const red = observe(
    await api.joinById(blue.room.roomId, { inviteKey: blue.key }),
  );
  await until(() => red.state);
  const green = observe(
    await api.joinById(blue.room.roomId, { inviteKey: blue.key }),
  );
  await until(() => green.state);
  assert.equal(
    blue.state.nationalMatch.rules.policyVersion,
    "phase7-v1",
    "Deploy Phase7 rule baseline before running this acceptance",
  );
  assert.equal(blue.state.objectiveMatch.points.length, 7);
  assert.equal(blue.state.nationalMatch.deadline, 9000);
  assert(blue.state.nationalMatch.players.every((p) => p.nationId === "blue"));
  assert.equal(blue.state.nationalMatch.players.length, 3);
  assert.equal(blue.state.seed, undefined);
  blue.room.send("start");
  await until(() => blue.state.tick >= 4);
  blue.room.send("command", { type: "RESUPPLY", squadIds: ["red-1-1"] });
  await until(() => blue.denied === "NOT_OWNER");
  blue.denied = "";
  blue.room.send("command", {
    type: "RECRUIT",
    unitType: "infantry",
    squadIds: [],
    xp: 50000,
  });
  await until(() => blue.denied === "INVALID_FORMAT");
  await green.room.leave();
  await until(
    () =>
      blue.state.objectiveMatch.result?.reason === "abandoned" &&
      red.state.objectiveMatch.result?.reason === "abandoned",
  );
  assert.deepEqual(blue.state.objectiveMatch, red.state.objectiveMatch);
  assert.deepEqual(
    blue.state.nationalMatch.ranking,
    red.state.nationalMatch.ranking,
  );
  assert.equal(blue.state.nationalMatch.ranking.length, 3);
  const tick = blue.state.tick;
  await delay(350);
  assert.equal(blue.state.tick, tick);
  blue.denied = "";
  blue.room.send("command", {
    type: "MOVE",
    squadIds: ["blue-1-1"],
    destination: { x: 1000, y: 1000 },
  });
  await until(() => blue.denied === "MATCH_FINISHED");
  console.log(
    JSON.stringify({
      ok: true,
      profile: "phase7-v1",
      sameRoom: true,
      threeNations: true,
      foreignCommandRejected: true,
      growthSpoofRejected: true,
      clientRuleOverrideIgnored: true,
      matchingFinalState: true,
      frozenTick: tick,
      humanRanking: blue.state.nationalMatch.ranking.map((p) => p.playerId),
    }),
  );
} finally {
  await Promise.allSettled(peers.map((p) => p.room.leave()));
}
