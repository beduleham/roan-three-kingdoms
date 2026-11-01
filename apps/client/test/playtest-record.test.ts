import { describe, expect, it } from "vitest";
import type { BattleView } from "@roan/protocol";
import { PlaytestRecord } from "../src/playtest-record.js";
function view(tick = 0): BattleView {
  return {
    tick,
    nationId: "blue",
    config: { tickMs: 100, positionUnitsPerTile: 1000 },
    visionRadiusUnits: 10000,
    squads: [
      {
        id: "a",
        ownerPlayerId: "blue-1",
        nationId: "blue",
        unitType: "spears",
        position: { x: 0, y: 0 },
        facing: { x: 1, y: 0 },
        hpMilli: 100,
        maxSoldiers: 20,
        soldiers: 10,
        morale: 10000,
        cohesion: 10000,
        stance: "balanced",
        formation: "normal",
        fsmState: "IDLE",
      },
    ],
    commanders: [],
    lastSeen: [],
    nationalMatch: {
      experimental: true,
      phase: 0,
      deadline: 9000,
      unifyNation: null,
      unifyTicks: 0,
      unifyRequired: 450,
      players: [
        {
          id: "blue-1",
          nationId: "blue",
          xp: 0,
          merit: 0,
          level: 1,
          rank: "junior",
          supplyPoints: 50,
          cap: { minMerit: 0, squads: 2, soldiers: 40 },
          nextXp: 17,
          offer: null,
          selected: [],
          job: null,
          feedback: "",
        },
      ],
      ranking: [],
      rules: {
        refillSoldiers: 5,
        costPerSoldier: 2,
        recruitCost: 40,
        recruitSoldiers: 10,
        jobTicks: 30,
        rMinLevel: 15,
        policyVersion: "phase7-v1",
      },
    },
  };
}
const parsed = (r: PlaytestRecord) => JSON.parse(r.export());
describe("local opt-in playtest observations", () => {
  it("records actual observation ticks, samples sparsely and never invents missed checkpoints", () => {
    const r = new PlaytestRecord("room", "blue-1");
    r.observe(view(12));
    r.observe(view(12));
    r.observe(view(299));
    r.observe(view(301));
    r.observe(view(9001));
    r.observe(view(3000));
    expect(
      parsed(r).samples.map((s: { observedTick: number }) => s.observedTick),
    ).toEqual([12, 301, 9001]);
    expect(parsed(r).coverage).toMatchObject({
      firstObservedTick: 12,
      lastObservedTick: 9001,
      exactCheckpoints: false,
      refreshResets: true,
    });
  });
  it("copies only self growth and public point summaries; never allied private data, enemy sightings or arbitrary fields", () => {
    const v = view(),
      r = new PlaytestRecord("room", "blue-1");
    v.nationalMatch!.players.push({
      ...v.nationalMatch!.players[0]!,
      id: "blue-2",
      feedback: "ally-secret",
    });
    v.lastSeen = [
      { id: "enemy-secret", position: { x: 777, y: 888 }, observedTick: 0 },
    ];
    Object.assign(v, {
      inviteKey: "secret-token",
      reconnectionToken: "secret-auth",
    });
    r.observe(v);
    v.nationalMatch!.players[0]!.selected.push("later-mutation");
    const s = r.export();
    for (const secret of [
      "ally-secret",
      "enemy-secret",
      "secret-token",
      "secret-auth",
      "later-mutation",
    ])
      expect(s).not.toContain(secret);
  });
  it("tracks held offers, choices, paid jobs, empty army and recovery without counting repeated renders", () => {
    const r = new PlaytestRecord("room", "blue-1"),
      v = view();
    r.observe(v);
    v.tick = 1;
    v.nationalMatch!.players[0]!.offer = {
      checkpoint: 5,
      candidates: ["q", "w", "r"],
    };
    r.observe(v);
    r.observe(v);
    v.tick = 2;
    v.nationalMatch!.players[0]!.selected = ["q"];
    v.nationalMatch!.players[0]!.offer = null;
    v.squads[0]!.hpMilli = 0;
    r.observe(v);
    v.tick = 3;
    v.squads[0]!.hpMilli = 100;
    r.observe(v);
    expect(parsed(r).changes).toHaveLength(4);
    expect(parsed(r).changes[2]).toMatchObject({
      emptyArmy: true,
      selected: ["q"],
    });
    expect(parsed(r).changes[3]).toMatchObject({ emptyArmy: false });
  });
  it("freezes final public result and ranking; admission replies do not mean command execution", () => {
    const r = new PlaytestRecord("room", "blue-1"),
      v = view();
    r.command(0, "RECRUIT");
    r.command(0, "secret-payload");
    r.reply(0, false, "NOT_OWNER");
    v.objectiveMatch = {
      experimental: true,
      tick: 4,
      limitTicks: 9000,
      targetScore: 999999,
      captureTicks: 30,
      radiusUnits: 1500,
      scoreEveryTicks: 50,
      status: "finished",
      scores: { blue: 0, red: 0, green: 0 },
      points: [],
      result: {
        winner: null,
        reason: "abandoned",
        scores: { blue: 0, red: 0, green: 0 },
        tick: 4,
      },
    };
    v.tick = 4;
    r.observe(v);
    v.tick = 500;
    r.observe(v);
    r.command(500, "MOVE");
    const data = parsed(r);
    expect(data.coverage.lastObservedTick).toBe(4);
    expect(data.submittedCommands).toEqual([{ tick: 0, type: "RECRUIT" }]);
    expect(data.admissionReplies).toEqual([
      { tick: 0, accepted: false, reason: "NOT_OWNER" },
    ]);
    expect(data.result.result.reason).toBe("abandoned");
  });
  it("bounds memory and notes and leaves each new tab record independent", () => {
    const r = new PlaytestRecord("room", "blue-1");
    for (let i = 0; i < 2005; i++) r.command(i, "MOVE");
    expect(parsed(r).coverage.dropped).toBe(5);
    expect(parsed(r).submittedCommands).toHaveLength(2000);
    expect(JSON.parse(r.export("x".repeat(3000))).notes).toHaveLength(2000);
    expect(parsed(new PlaytestRecord("next", "red-1")).samples).toEqual([]);
  });
});
