import { describe, expect, it } from "vitest";
import { NationVisibility } from "../src/visibility.js";
import {
  AuthoritativeMatch,
  initialOnlineBattle,
  initialTeamBattle,
} from "../src/match.js";
import {
  diffState,
  applyVerifiedDelta,
} from "../../../packages/protocol/src/index.js";
import { hashReplayValue } from "../../../packages/battle-core/src/index.js";

describe("nation shared visibility", () => {
  it("uses all living allied squads and includes the exact radius boundary", () => {
    const state = initialTeamBattle(),
      fog = new NationVisibility(10);
    state.squads.forEach((s) => {
      s.position =
        s.nationId === "blue" ? { x: 0, y: 0 } : { x: 50000, y: 50000 };
    });
    const spotter = state.squads.find((s) => s.id === "blue-3-1")!;
    const target = state.squads.find((s) => s.id === "red-1-1")!;
    spotter.position = { x: 20000, y: 0 };
    target.position = { x: 30000, y: 0 };
    fog.observe(state);
    expect(fog.view(state, "blue").squads.some((s) => s.id === target.id)).toBe(
      true,
    );
    target.position.x++;
    expect(fog.view(state, "blue").squads.some((s) => s.id === target.id)).toBe(
      false,
    );
    target.position.x--;
    spotter.hpMilli = 0;
    expect(fog.view(state, "blue").squads.some((s) => s.id === target.id)).toBe(
      false,
    );
  });
  it("freezes only last position and tick outside vision, then refreshes on reacquisition", () => {
    const state = initialOnlineBattle(),
      fog = new NationVisibility(10);
    state.squads
      .filter((s) => s.nationId === "blue")
      .forEach((s) => {
        s.position = { x: 0, y: 0 };
      });
    const enemy = state.squads.find((s) => s.id === "red-1")!;
    state.squads.find((s) => s.id === "red-2")!.position = {
      x: 40000,
      y: 40000,
    };
    state.tick = 7;
    enemy.position = { x: 10000, y: 0 };
    fog.observe(state);
    const before = fog.view(state, "blue");
    state.tick = 8;
    enemy.position.x = 10001;
    enemy.hpMilli = 1234567;
    fog.observe(state);
    const hidden = fog.view(state, "blue");
    expect(hidden.squads.map((s) => s.id)).toEqual(["blue-1", "blue-2"]);
    expect(hidden.lastSeen).toEqual([
      { id: "red-1", position: { x: 10000, y: 0 }, observedTick: 7 },
    ]);
    expect(JSON.stringify(hidden)).not.toContain("1234567");
    expect(hidden).not.toHaveProperty("seed");
    expect(hidden).not.toHaveProperty("players");
    expect(hidden.commanders.every((c) => c.ownerPlayerId === "blue")).toBe(
      true,
    );
    expect(before.squads[0]).not.toHaveProperty("order");
    const delta = {
      baseTick: before.tick,
      tick: hidden.tick,
      changes: diffState(before, hidden),
      hash: hashReplayValue(hidden),
    };
    expect(applyVerifiedDelta(before, delta, hashReplayValue)).toEqual(hidden);
    state.tick = 9;
    enemy.position.x = 25000;
    fog.observe(state);
    expect(fog.view(state, "blue").lastSeen).toEqual(hidden.lastSeen);
    state.tick = 10;
    enemy.position.x = 9000;
    fog.observe(state);
    const visible = fog.view(state, "blue");
    expect(visible.lastSeen).toEqual([]);
    expect(visible.squads.find((s) => s.id === "red-1")?.hpMilli).toBe(1234567);
  });
  it("does not send hidden entity references through events or accept hidden direct targets", () => {
    const match = new AuthoritativeMatch();
    match.join("blue");
    match.join("red");
    match.state.squads
      .filter((s) => s.nationId === "red")
      .forEach((s) => {
        s.position.x = 50000;
      });
    const events = match.visibility.events(match.state, "blue", [
      {
        tick: 0,
        type: "ATTACK_HIT",
        actorId: "red-1",
        targetId: "blue-1",
        delta: -1,
      },
      {
        tick: 0,
        type: "TARGET_ACQUIRED",
        actorId: "blue-1",
        targetId: "red-1",
      },
      { tick: 0, type: "ORDER_ACCEPTED", actorId: "blue-1" },
    ]);
    expect(events).toEqual([
      { tick: 0, type: "ORDER_ACCEPTED", actorId: "blue-1" },
    ]);
    for (const payload of [
      { type: "ATTACK", squadIds: ["blue-1"], targetSquadId: "red-1" },
      {
        type: "CAST_SKILL",
        squadIds: ["blue-1"],
        commanderId: "blue-commander",
        skill: "Q",
        targetSquadId: "red-1",
      },
    ])
      expect(match.submit("blue", payload)).toEqual({
        accepted: false,
        reason: "TARGET_NOT_VISIBLE",
      });
    expect(
      match.submit("blue", {
        type: "ATTACK_MOVE",
        squadIds: ["blue-1"],
        destination: { x: 12000, y: 4000 },
      }).accepted,
    ).toBe(true);
  });
  it("keeps the radius adjustable without changing battle configuration", () => {
    const state = initialOnlineBattle();
    state.squads
      .filter((s) => s.nationId === "blue")
      .forEach((s) => {
        s.position = { x: 0, y: 0 };
      });
    state.squads.find((s) => s.id === "red-1")!.position = { x: 9000, y: 0 };
    expect(new NationVisibility(8).visibleIds(state, "blue").has("red-1")).toBe(
      false,
    );
    expect(
      new NationVisibility(10).visibleIds(state, "blue").has("red-1"),
    ).toBe(true);
    expect(() => new NationVisibility(0)).toThrow("Invalid vision radius");
  });
});
