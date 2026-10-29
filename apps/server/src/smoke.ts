import { spawn } from "node:child_process";
import assert from "node:assert/strict";
import { Client } from "@colyseus/sdk";
import { hashReplayValue } from "../../../packages/battle-core/dist/index.js";
import type { BattleState } from "../../../packages/battle-core/dist/index.js";

const port = 2677;
const child = spawn(
  process.execPath,
  [new URL("./index.js", import.meta.url).pathname],
  {
    env: { ...process.env, PORT: String(port) },
    stdio: "ignore",
  },
);
async function until(predicate: () => boolean, ms = 8000) {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 40));
  }
  throw new Error("Online smoke timed out");
}
try {
  let serving = false;
  const probe = setInterval(async () => {
    try {
      await fetch(`http://127.0.0.1:${port}/`);
      serving = true;
    } catch {
      /* starting */
    }
  }, 50);
  try {
    await until(() => serving);
  } finally {
    clearInterval(probe);
  }
  const api = new Client(`ws://127.0.0.1:${port}`);
  const blue = await api.joinOrCreate("battle_1v1");
  const red = await api.joinOrCreate("battle_1v1");
  assert.equal(blue.roomId, red.roomId);
  let blueSeat = "",
    redSeat = "";
  let denied = "",
    accepted = false;
  const snapshots = [new Map<number, string>(), new Map<number, string>()];
  blue.onMessage("seat", (v: { seat: string }) => {
    blueSeat = v.seat;
  });
  red.onMessage("seat", (v: { seat: string }) => {
    redSeat = v.seat;
  });
  blue.onMessage("ready", () => {});
  red.onMessage("ready", () => {});
  blue.onMessage("snapshot", (v: { state: BattleState }) =>
    snapshots[0]!.set(v.state.tick, hashReplayValue(v.state)),
  );
  red.onMessage("snapshot", (v: { state: BattleState }) =>
    snapshots[1]!.set(v.state.tick, hashReplayValue(v.state)),
  );
  blue.onMessage(
    "command-result",
    (v: { accepted: boolean; reason?: string }) => {
      if (!v.accepted) denied = v.reason ?? "";
      else accepted = true;
    },
  );
  blue.send("hello");
  red.send("hello");
  await until(
    () =>
      !!blueSeat && !!redSeat && snapshots[0]!.has(0) && snapshots[1]!.has(0),
  );
  assert.deepEqual([blueSeat, redSeat], ["blue", "red"]);
  blue.send("command", {
    type: "ATTACK",
    squadIds: ["red-1"],
    targetSquadId: "blue-1",
  });
  await until(() => denied !== "");
  assert.equal(denied, "NOT_OWNER");
  blue.send("command", {
    type: "ATTACK_MOVE",
    squadIds: ["blue-1"],
    destination: { x: 10000, y: 6500 },
  });
  await until(
    () =>
      accepted &&
      [...snapshots[0]!.keys()].some((tick) => tick >= 4) &&
      [...snapshots[1]!.keys()].some((tick) => tick >= 4),
  );
  const common = [...snapshots[0]!.keys()].filter((tick) =>
    snapshots[1]!.has(tick),
  );
  assert(common.length >= 3);
  for (const tick of common)
    assert.equal(snapshots[0]!.get(tick), snapshots[1]!.get(tick));
  console.log(
    JSON.stringify({
      sameRoom: true,
      seats: [blueSeat, redSeat],
      denied,
      accepted,
      matchingTicks: common.length,
    }),
  );
  await blue.leave();
  await red.leave();
} finally {
  child.kill();
}
