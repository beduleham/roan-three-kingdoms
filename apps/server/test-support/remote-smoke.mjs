import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { Client } from "@colyseus/sdk";
import { applyVerifiedDelta } from "@roan/protocol";
import { hashReplayValue } from "../../../packages/battle-core/dist/index.js";

const base = new URL(process.env.DEMO_URL ?? "http://127.0.0.1:4185");
assert(
  base.protocol === "https:" ||
    (base.protocol === "http:" &&
      ["localhost", "127.0.0.1"].includes(base.hostname)),
  "Use HTTPS for remote hosts",
);
const peers = [];
let failure;
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function until(check) {
  const deadline = performance.now() + 15000;
  while (!check()) {
    if (failure) throw failure;
    assert(performance.now() < deadline, "Remote acceptance timed out");
    await pause(25);
  }
}
function observe(room) {
  const peer = {
    room,
    seat: "",
    key: "",
    state: null,
    history: new Map(),
    denied: "",
    awaitingSnapshot: false,
    resyncs: 0,
    skippedDelta: false,
  };
  peers.push(peer);
  room.onMessage("*", () => {});
  room.onMessage("seat", ({ seat }) => {
    peer.seat = seat;
  });
  room.onMessage("invite-key", ({ key }) => {
    peer.key = key;
  });
  room.onMessage("snapshot", ({ state }) => {
    peer.awaitingSnapshot = false;
    peer.state = state;
    peer.history.set(state.tick, state);
  });
  room.onMessage("delta", (delta) => {
    if (
      process.env.REMOTE_SMOKE_SKIP_ONE_DELTA === "1" &&
      !peer.skippedDelta &&
      peer.state
    ) {
      peer.skippedDelta = true;
      return;
    }
    if (peer.awaitingSnapshot) return;
    const next =
      peer.state && applyVerifiedDelta(peer.state, delta, hashReplayValue);
    if (!next) {
      if (peer.state?.tick === delta.baseTick) {
        failure = new Error("Invalid remote view delta hash");
      } else {
        peer.awaitingSnapshot = true;
        peer.resyncs++;
        room.send("hello");
      }
      return;
    }
    peer.state = next;
    peer.history.set(next.tick, next);
  });
  room.onMessage("command-result", ({ accepted, reason }) => {
    if (!accepted) peer.denied = reason;
  });
  room.send("hello");
  return peer;
}
try {
  assert(
    (
      await fetch(new URL("/healthz", base), {
        signal: AbortSignal.timeout(10000),
      })
    ).ok,
    "Health check failed",
  );
  assert(
    (
      await fetch(new URL("/online.html", base), {
        signal: AbortSignal.timeout(10000),
      })
    ).ok,
    "Built client unavailable",
  );
  const api = new Client(base.origin.replace(/^http/, "ws"));
  const blue = observe(
    await api.create("battle_1v1", {
      inviteOnly: true,
      creatorProof: randomBytes(32).toString("hex"),
    }),
  );
  await until(() => blue.key && blue.seat);
  const red = observe(
    await api.joinById(blue.room.roomId, { inviteKey: blue.key }),
  );
  await until(() => red.seat && red.state?.tick >= 4 && blue.state?.tick >= 4);
  assert.equal(blue.seat, "blue");
  assert.equal(red.seat, "red");
  blue.room.send("command", {
    type: "MOVE",
    squadIds: ["red-1"],
    destination: { x: 1000, y: 1000 },
  });
  await until(() => blue.denied === "NOT_OWNER");
  let matchingTick = -1;
  await until(() => {
    for (const [tick, view] of blue.history) {
      const other = red.history.get(tick);
      if (tick < 2 || !other) continue;
      const shared = view.squads.filter((squad) =>
        other.squads.some((entry) => entry.id === squad.id),
      );
      if (
        shared.length &&
        shared.every(
          (squad) =>
            JSON.stringify(squad) ===
            JSON.stringify(other.squads.find((entry) => entry.id === squad.id)),
        )
      ) {
        matchingTick = tick;
        return true;
      }
    }
    return false;
  });
  console.log(
    JSON.stringify({
      ok: true,
      transport: base.protocol === "https:" ? "wss" : "ws-local",
      sameRoom: blue.room.roomId === red.room.roomId,
      seats: [blue.seat, red.seat],
      matchingTick,
      resyncs: peers.map((peer) => peer.resyncs),
      denied: blue.denied,
    }),
  );
} finally {
  await Promise.allSettled(peers.map(({ room }) => room.leave()));
}
