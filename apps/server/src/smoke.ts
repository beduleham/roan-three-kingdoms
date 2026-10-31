import { spawn } from "node:child_process";
import assert from "node:assert/strict";
import { Client } from "@colyseus/sdk";
import { hashReplayValue } from "../../../packages/battle-core/dist/index.js";
import {
  applyVerifiedDelta,
  type StateDelta,
  type BattleView,
} from "@roan/protocol";

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
  const latest: (BattleView | null)[] = [null, null];
  const views = [new Map<number, BattleView>(), new Map<number, BattleView>()];
  const wireSizes: number[] = [];
  blue.onMessage("seat", (v: { seat: string }) => {
    blueSeat = v.seat;
  });
  red.onMessage("seat", (v: { seat: string }) => {
    redSeat = v.seat;
  });
  blue.onMessage("ready", () => {});
  red.onMessage("ready", () => {});
  blue.onMessage("lobby", () => {});
  red.onMessage("lobby", () => {});
  for (const [index, connection] of [blue, red].entries()) {
    connection.onMessage("snapshot", (v: { state: BattleView }) => {
      assert(
        !("seed" in v.state) && !("players" in v.state),
        "full core state leaked",
      );
      assert(
        v.state.squads.every(
          (squad) => !("order" in squad) && !("currentTargetId" in squad),
        ),
      );
      latest[index] = v.state;
      views[index]!.set(v.state.tick, v.state);
      snapshots[index]!.set(v.state.tick, hashReplayValue(v.state));
    });
    connection.onMessage("delta", (d: StateDelta) => {
      const base = latest[index];
      assert(base);
      assert.equal(base.tick, d.baseTick);
      const next = applyVerifiedDelta(base, d, hashReplayValue);
      assert(next);
      latest[index] = next;
      views[index]!.set(d.tick, next);
      snapshots[index]!.set(d.tick, d.hash);
      if (index === 0) wireSizes.push(JSON.stringify(d).length);
    });
  }
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
  for (const tick of common) {
    const blueView = views[0]!.get(tick)!,
      redView = views[1]!.get(tick)!;
    for (const squad of blueView.squads) {
      const shared = redView.squads.find((s) => s.id === squad.id);
      if (shared) assert.deepEqual(squad, shared);
    }
  }
  assert(wireSizes.length > 0);
  console.log(
    JSON.stringify({
      sameRoom: true,
      seats: [blueSeat, redSeat],
      denied,
      accepted,
      matchingTicks: common.length,
      hashScope: "nation-view",
      firstDeltaBytes: wireSizes[0],
      fullStateBytes: JSON.stringify(latest[0]).length,
    }),
  );
  await blue.leave();
  await red.leave();
} finally {
  child.kill();
}
