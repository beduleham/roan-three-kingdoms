import { spawn } from "node:child_process";
import { performance } from "node:perf_hooks";
import assert from "node:assert/strict";
import { Client } from "@colyseus/sdk";
import { applyVerifiedDelta, type StateDelta } from "@roan/protocol";
import { hashReplayValue } from "../../../packages/battle-core/dist/index.js";
import type { BattleState } from "../../../packages/battle-core/dist/index.js";

const targetTick = Number(process.env.ONLINE_SOAK_TICKS ?? 900);
assert(
  Number.isSafeInteger(targetTick) && targetTick >= 100,
  "ONLINE_SOAK_TICKS must be an integer >= 100",
);
const port = 2687;
const child = spawn(
  process.execPath,
  [new URL("./index.js", import.meta.url).pathname],
  {
    env: { ...process.env, PORT: String(port) },
    stdio: "ignore",
  },
);
type Peer = {
  room: Awaited<ReturnType<Client["joinOrCreate"]>>;
  seat: string;
  state: BattleState | null;
  hashes: Map<number, string>;
  ready: boolean;
  connected: boolean;
  awaitingSnapshot: boolean;
  snapshots: number;
  resyncs: number;
  reconnects: number;
  accepted: number;
  rejected: Map<string, number>;
};
const peers: Peer[] = [];
let failure: Error | null = null;
let skipOneDelta = true;
let skippedTick = -1;
let deltaBytes = 0;
let deltas = 0;
const pause = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));
async function until(check: () => boolean, timeout = 10000) {
  const deadline = performance.now() + timeout;
  while (performance.now() < deadline) {
    if (failure) throw failure;
    if (check()) return;
    await pause(25);
  }
  throw new Error("3v3 soak timed out");
}
try {
  let serving = false;
  const startupDeadline = performance.now() + 10000;
  while (!serving && performance.now() < startupDeadline) {
    try {
      await fetch(`http://127.0.0.1:${port}/`);
      serving = true;
    } catch {
      await pause(50);
    }
  }
  assert(serving && child.exitCode === null, "server failed to start");
  const api = new Client(`ws://127.0.0.1:${port}`);
  for (let index = 0; index < 6; index++) {
    const room =
      index === 0
        ? await api.create("battle_3v3")
        : await api.joinById(peers[0]!.room.roomId);
    const peer: Peer = {
      room,
      seat: "",
      state: null,
      hashes: new Map(),
      ready: false,
      connected: true,
      awaitingSnapshot: false,
      snapshots: 0,
      resyncs: 0,
      reconnects: 0,
      accepted: 0,
      rejected: new Map(),
    };
    peers.push(peer);
    room.reconnection.minDelay = 100;
    room.reconnection.maxDelay = 500;
    room.onMessage("seat", ({ seat }: { seat: string }) => {
      peer.seat = seat;
    });
    room.onMessage("lobby", () => {});
    room.onMessage("ready", ({ ready }: { ready: boolean }) => {
      peer.ready = ready;
    });
    room.onMessage("start-result", ({ accepted }: { accepted: boolean }) => {
      if (!accepted) failure = new Error("start rejected");
    });
    room.onMessage(
      "command-result",
      ({ accepted, reason }: { accepted: boolean; reason?: string }) => {
        if (accepted) peer.accepted++;
        else
          peer.rejected.set(
            reason ?? "UNKNOWN",
            (peer.rejected.get(reason ?? "UNKNOWN") ?? 0) + 1,
          );
      },
    );
    room.onMessage("snapshot", ({ state }: { state: BattleState }) => {
      peer.state = state;
      peer.hashes.set(state.tick, hashReplayValue(state));
      peer.awaitingSnapshot = false;
      peer.snapshots++;
    });
    room.onMessage("delta", (delta: StateDelta) => {
      if (index === 0) {
        deltaBytes += Buffer.byteLength(JSON.stringify(delta));
        deltas++;
      }
      if (index === 2 && skipOneDelta && delta.tick >= 20) {
        skipOneDelta = false;
        skippedTick = delta.tick;
        return;
      }
      if (peer.awaitingSnapshot) return;
      const next = applyVerifiedDelta(peer.state, delta, hashReplayValue);
      if (!next) {
        if (peer.state?.tick === delta.baseTick) {
          failure = new Error(
            `invalid authoritative delta at tick ${delta.tick}`,
          );
          return;
        }
        peer.awaitingSnapshot = true;
        peer.resyncs++;
        room.send("hello");
        return;
      }
      peer.state = next;
      peer.hashes.set(delta.tick, delta.hash);
    });
    room.onDrop(() => {
      peer.connected = false;
      peer.ready = false;
    });
    room.onReconnect(() => {
      peer.connected = true;
      peer.reconnects++;
      room.send("hello");
    });
    room.onLeave(() => {
      peer.connected = false;
    });
    room.send("hello");
    await until(() => peer.seat !== "" && peer.state !== null);
  }
  assert.deepEqual(
    peers.map((peer) => peer.seat),
    ["blue-1", "red-1", "blue-2", "red-2", "blue-3", "red-3"],
  );
  peers[0]!.room.send("start");
  await until(() => peers.every((peer) => peer.ready));
  const startedAt = performance.now();
  const deadline = startedAt + targetTick * 100 + 30000;
  let lastCommandTick = -20;
  let dropIssued = false;
  while (!peers.every((peer) => (peer.state?.tick ?? -1) >= targetTick)) {
    if (failure) throw failure;
    assert(performance.now() < deadline, "soak did not reach target tick");
    const tick = peers[0]!.state?.tick ?? 0;
    if (
      tick - lastCommandTick >= 20 &&
      peers.every((peer) => peer.ready && peer.connected)
    ) {
      lastCommandTick = tick;
      for (const peer of peers)
        peer.room.send("command", {
          type: "SET_STANCE",
          squadIds: [`${peer.seat}-1`],
          stance: tick % 40 < 20 ? "balanced" : "aggressive",
        });
      const first = peers[0]!;
      first.room.send("command", {
        type: "MOVE",
        squadIds: ["red-1-1"],
        destination: { x: 10000, y: 6500 },
      });
      first.room.send("command", {
        type: "MOVE",
        squadIds: ["blue-1-1"],
        destination: { x: "invalid", y: 0 },
      });
    }
    if (!dropIssued && tick >= 60) {
      dropIssued = true;
      void peers[4]!.room.leave(false);
    }
    await pause(40);
  }
  const common = [...peers[0]!.hashes.keys()].filter((tick) =>
    peers.every((peer) => peer.hashes.has(tick)),
  );
  assert(
    common.length >= Math.floor(targetTick / 2) - 10,
    "too few ticks shared by all six clients",
  );
  for (const tick of common) {
    const hash = peers[0]!.hashes.get(tick);
    assert(
      peers.every((peer) => peer.hashes.get(tick) === hash),
      `state mismatch at tick ${tick}`,
    );
  }
  assert(
    skippedTick >= 20 && peers[2]!.resyncs >= 1 && peers[2]!.snapshots >= 2,
    "missing patch did not recover",
  );
  assert(
    peers[4]!.reconnects >= 1 && peers[4]!.seat === "blue-3",
    "drop did not resume the same seat",
  );
  assert(
    peers.every((peer) => peer.accepted >= 4),
    "commands were not repeatedly accepted",
  );
  assert((peers[0]!.rejected.get("NOT_OWNER") ?? 0) >= 4);
  assert((peers[0]!.rejected.get("INVALID_FORMAT") ?? 0) >= 4);
  console.log(
    JSON.stringify({
      targetTick,
      elapsedSeconds: Number(
        ((performance.now() - startedAt) / 1000).toFixed(2),
      ),
      clients: peers.length,
      commonTicks: common.length,
      skippedTick,
      resyncs: peers.map((peer) => peer.resyncs),
      reconnects: peers.map((peer) => peer.reconnects),
      accepted: peers.map((peer) => peer.accepted),
      rejected: Object.fromEntries(peers[0]!.rejected),
      averageDeltaBytes: Math.round(deltaBytes / deltas),
      finalHash: peers[0]!.hashes.get(common.at(-1)!),
    }),
  );
} finally {
  await Promise.allSettled(peers.map((peer) => peer.room.leave()));
  child.kill();
}
