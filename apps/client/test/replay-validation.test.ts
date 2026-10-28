import { expect, it } from "vitest";
import { verifyReplayText } from "../src/replay-validation.js";
import { replayPolicy } from "../src/replay-policy.js";
import { LocalSession, DEMO } from "../src/session.js";
import {
  parseBattleConfig,
  canonicalJson,
} from "../../../packages/battle-core/src/index.js";
import raw from "../../../battle_config.v1.json";
const config = parseBattleConfig(raw);
const make = () => new LocalSession(config);
it("replays actual inputs without changing the current session", () => {
  const s = make();
  s.startEngagement();
  s.advance(600);
  const before = canonicalJson(s.exportLog());
  expect(verifyReplayText(before)).toMatchObject({
    status: "match",
    stateMatches: true,
    eventMatches: true,
    frames: 6,
    commands: 2,
    tick: 6,
  });
  expect(canonicalJson(s.exportLog())).toBe(before);
});
it("accepts an untouched zero-tick snapshot and experimental augment initial state", () => {
  expect(verifyReplayText(JSON.stringify(make().exportLog()))).toMatchObject({
    status: "match",
    tick: 0,
  });
  const s = new LocalSession(config, {
    human: ["archers", "spears"],
    enemy: ["infantry", "cavalry"],
    experimental: true,
  });
  s.startEngagement();
  s.advance(300);
  expect(verifyReplayText(JSON.stringify(s.exportLog())).status).toBe("match");
});
it.each(["stateHash", "eventHash"] as const)(
  "identifies a changed %s separately",
  (key) => {
    const log = make().exportLog();
    log[key] = "0000000000000000";
    expect(verifyReplayText(JSON.stringify(log))).toMatchObject({
      status: "mismatch",
      stateMatches: key !== "stateHash",
      eventMatches: key !== "eventHash",
    });
  },
);
it("does not treat changed inputs as the saved outcome", () => {
  const s = make();
  s.startEngagement();
  s.advance(200);
  const log = structuredClone(s.exportLog());
  log.frames = log.frames.map(() => []);
  expect(verifyReplayText(JSON.stringify(log)).status).toBe("mismatch");
});
it.each(["{bad", ""])("rejects broken JSON %s", (text) =>
  expect(verifyReplayText(text)).toMatchObject({
    status: "invalid",
    code: "JSON",
  }),
);
it("rejects unsupported versions and missing or malformed records", () => {
  const log = make().exportLog();
  expect(
    verifyReplayText(JSON.stringify({ ...log, version: "future" })),
  ).toMatchObject({ code: "VERSION" });
  expect(
    verifyReplayText(JSON.stringify({ version: DEMO.version })),
  ).toMatchObject({ code: "SHAPE" });
  expect(
    verifyReplayText(JSON.stringify({ ...log, stateHash: "<script>" })),
  ).toMatchObject({ code: "SHAPE" });
  expect(verifyReplayText("null")).toMatchObject({ code: "SHAPE" });
});
it("reconstructs initial state instead of trusting extra or inconsistent fields", () => {
  const log = make().exportLog();
  expect(
    verifyReplayText(
      JSON.stringify({ ...log, initial: { ...log.initial, tick: 1 } }),
    ),
  ).toMatchObject({ code: "INITIAL" });
  expect(
    verifyReplayText(
      JSON.stringify({ ...log, initial: { ...log.initial, extra: true } }),
    ),
  ).toMatchObject({ code: "INITIAL" });
  const invalid = structuredClone(log);
  invalid.initial.squads[0]!.hpMilli = -1;
  expect(verifyReplayText(JSON.stringify(invalid))).toMatchObject({
    code: "INITIAL",
  });
});
it("validates every command envelope before replay", () => {
  const log = make().exportLog();
  expect(
    verifyReplayText(JSON.stringify({ ...log, frames: [null] })),
  ).toMatchObject({ code: "INPUT" });
  expect(
    verifyReplayText(
      JSON.stringify({
        ...log,
        frames: [[{ playerId: "human", command: { type: "MOVE" } }]],
      }),
    ),
  ).toMatchObject({ code: "INPUT" });
});
it("bounds file bytes, tick count, and per-tick inputs", () => {
  const log = make().exportLog();
  expect(verifyReplayText(" ".repeat(replayPolicy.maxBytes + 1))).toMatchObject(
    { code: "LIMIT" },
  );
  expect(
    verifyReplayText(
      JSON.stringify({
        ...log,
        frames: Array.from({ length: replayPolicy.maxFrames + 1 }, () => []),
      }),
    ),
  ).toMatchObject({ code: "LIMIT" });
  expect(
    verifyReplayText(
      JSON.stringify({
        ...log,
        frames: [Array(replayPolicy.maxCommandsPerFrame + 1).fill({})],
      }),
    ),
  ).toMatchObject({ code: "LIMIT" });
});

it("bounds aggregate input work even when every command has a valid shape", () => {
  const log = make().exportLog();
  const input = {
    playerId: "human",
    command: {
      type: "MOVE",
      seq: 0,
      requestedTick: 0,
      squadIds: ["human-1"],
      destination: { x: 7000, y: 4000 },
    },
  };
  const frames = Array.from(
    {
      length: Math.ceil(
        (replayPolicy.maxCommands + 1) / replayPolicy.maxCommandsPerFrame,
      ),
    },
    () => Array(replayPolicy.maxCommandsPerFrame).fill(input),
  );
  expect(verifyReplayText(JSON.stringify({ ...log, frames }))).toMatchObject({
    status: "invalid",
    code: "LIMIT",
  });
});
