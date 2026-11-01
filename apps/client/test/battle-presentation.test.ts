import { expect, it, vi, afterEach } from "vitest";
import type { BattleView } from "@roan/protocol";
import { BattlePresentation } from "../src/battle-presentation.js";
import { BattleAudio } from "../src/battle-audio.js";
import { RenderPerformance } from "../src/render-performance.js";
function view(tick = 1): BattleView {
  return {
    tick,
    nationId: "blue",
    config: { tickMs: 100, positionUnitsPerTile: 1000 },
    visionRadiusUnits: 1000,
    squads: [
      {
        id: "a",
        ownerPlayerId: "blue-1",
        nationId: "blue",
        position: { x: 100, y: 100 },
        facing: { x: 1, y: 0 },
        unitType: "spears",
        hpMilli: 100,
        maxSoldiers: 20,
        soldiers: 1,
        morale: 100,
        cohesion: 100,
        formation: "normal",
        stance: "balanced",
        fsmState: "IDLE",
      },
    ],
    commanders: [
      {
        id: "c",
        ownerPlayerId: "blue-1",
        assignedSquadId: "a",
        hpMilli: 100,
        status: "ACTIVE",
        cooldownTicks: { Q: 0, W: 0, R: 0 },
      },
    ],
    lastSeen: [],
  };
}
afterEach(() => vi.unstubAllGlobals());
it("deduplicates skill cues, excludes rejected/stale/future/hidden events and never mutates views", () => {
  const p = new BattlePresentation(),
    v = view(20),
    before = structuredClone(v);
  p.baseline(v);
  const e = { type: "SKILL_CAST", tick: 19, actorId: "c", skill: "W" };
  expect(
    p.ingest(v, [
      e,
      e,
      { ...e, actorId: "hidden" },
      { ...e, type: "COMMAND_REJECTED" },
      { ...e, tick: 40 },
      { ...e, tick: 0 },
    ]),
  ).toEqual(["W"]);
  expect(p.ingest(v, [e])).toEqual([]);
  expect(v).toEqual(before);
  expect(p.effects).toHaveLength(1);
  p.baseline(v);
  expect(p.effects).toHaveLength(0);
  expect(p.ingest(v, [e])).toEqual([]);
  p.reset();
  p.baseline(v);
  expect(p.ingest(v, [e])).toEqual(["W"]);
});
it("uses observed rout and wound transitions once and drops effects when the actor leaves visibility", () => {
  const p = new BattlePresentation();
  p.baseline(view());
  const v = view(2);
  v.squads[0]!.fsmState = "ROUTED";
  v.commanders[0]!.status = "WOUNDED";
  expect(p.ingest(v, [])).toEqual(["rout", "wounded"]);
  expect(p.ingest(v, [])).toEqual([]);
  const hidden = { ...view(3), squads: [], commanders: [] };
  p.ingest(hidden, []);
  expect(p.effects).toEqual([]);
});
it("caps transient effects and expires them by simulation tick", () => {
  const p = new BattlePresentation(),
    v = view(10);
  p.baseline(v);
  p.ingest(
    v,
    Array.from({ length: 80 }, (_, i) => ({
      type: "SKILL_CAST",
      tick: 10,
      actorId: "c",
      skill: i % 2 ? "W" : "R",
      targetId: String(i),
    })),
  );
  expect(p.effects).toHaveLength(48);
  p.ingest(view(30), []);
  expect(p.effects).toEqual([]);
});
it("audio starts only on enable, honors volume/visibility/mute and limits overlapping voices", async () => {
  const oscillators: {
    start: ReturnType<typeof vi.fn>;
    stop: ReturnType<typeof vi.fn>;
  }[] = [];
  const ctx = {
    state: "running",
    currentTime: 1,
    destination: {},
    resume: vi.fn(async () => {}),
    createOscillator: () => {
      const o = {
        type: "",
        frequency: { value: 0 },
        connect: vi.fn(),
        disconnect: vi.fn(),
        onended: null,
        start: vi.fn(),
        stop: vi.fn(),
      };
      oscillators.push(o);
      return o;
    },
    createGain: () => ({
      gain: {
        setValueAtTime: vi.fn(),
        linearRampToValueAtTime: vi.fn(),
        exponentialRampToValueAtTime: vi.fn(),
      },
      connect: vi.fn(),
      disconnect: vi.fn(),
    }),
  };
  const factory = vi.fn(function () {
    return ctx;
  });
  vi.stubGlobal("AudioContext", factory);
  const a = new BattleAudio();
  a.play(["W"], true);
  expect(factory).not.toHaveBeenCalled();
  await a.enable();
  a.play(["W"], false);
  expect(oscillators).toHaveLength(0);
  a.volume = 0;
  a.play(["W"], true);
  expect(oscillators).toHaveLength(0);
  a.volume = 0.3;
  for (let i = 0; i < 8; i++) {
    ctx.currentTime += 0.1;
    a.play(["hit", "R"], true);
  }
  expect(oscillators).toHaveLength(6);
  a.mute();
  expect(a.enabled).toBe(false);
  expect(oscillators.every((o) => o.stop.mock.calls.length >= 2)).toBe(true);
});
it("bounds paint samples and excludes background time from frame intervals", () => {
  const p = new RenderPerformance();
  for (let i = 0; i < 250; i++) p.record(i * 34, i * 34 + 2);
  expect(p.summary()).toMatchObject({ samples: 180, paintP95Ms: 2 });
  expect(p.summary().observedFps).toBeCloseTo(1000 / 34);
  p.pause();
  p.record(100000, 100002);
  expect(p.summary().observedFps).toBeCloseTo(1000 / 34);
});
