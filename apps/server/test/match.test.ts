import { describe, expect, it } from "vitest";
import { hashReplayValue } from "../../../packages/battle-core/src/index.js";
import { AuthoritativeMatch } from "../src/match.js";

describe("server seat authority", () => {
  it("binds two sessions to different sides and rejects spoofed commands", () => {
    const match = new AuthoritativeMatch();
    expect(match.join("client-A")).toBe("blue");
    expect(match.join("client-B")).toBe("red");
    expect(match.join("client-C")).toBeNull();
    const before = hashReplayValue(match.state);
    expect(
      match.submit("client-A", {
        type: "ATTACK",
        squadIds: ["red-1"],
        targetSquadId: "blue-1",
      }),
    ).toEqual({ accepted: false, reason: "NOT_OWNER" });
    expect(
      match.submit("client-C", {
        type: "MOVE",
        squadIds: ["blue-1"],
        destination: { x: 1, y: 1 },
      }),
    ).toEqual({ accepted: false, reason: "NO_SEAT" });
    expect(
      match.submit("client-A", {
        type: "MOVE",
        squadIds: ["blue-1"],
        destination: { x: 1, y: 1 },
        playerId: "red",
      }),
    ).toEqual({ accepted: false, reason: "INVALID_FORMAT" });
    expect(hashReplayValue(match.state)).toBe(before);
    expect(
      match.submit("client-B", {
        type: "ATTACK",
        squadIds: ["red-1"],
        targetSquadId: "blue-1",
      }).accepted,
    ).toBe(true);
    const result = match.advance();
    expect(result?.state.tick).toBe(1);
    expect(
      result?.events.some((event) => event.type === "COMMAND_REJECTED"),
    ).toBe(false);
  });
  it("does not advance before both players join", () => {
    const match = new AuthoritativeMatch();
    match.join("first");
    expect(match.advance()).toBeNull();
    expect(match.state.tick).toBe(0);
  });
  it("reserves a dropped seat, pauses, then resumes the same owner", () => {
    const match = new AuthoritativeMatch();
    match.join("first");
    match.join("second");
    expect(
      match.submit("first", {
        type: "ATTACK_MOVE",
        squadIds: ["blue-1"],
        destination: { x: 10000, y: 6500 },
      }).accepted,
    ).toBe(true);
    match.drop("first");
    expect(match.ready).toBe(false);
    expect(match.join("stranger")).toBeNull();
    expect(match.advance()).toBeNull();
    expect(
      match.submit("second", {
        type: "ATTACK",
        squadIds: ["red-1"],
        targetSquadId: "blue-1",
      }),
    ).toEqual({ accepted: false, reason: "MATCH_PAUSED" });
    expect(match.reconnect("first")).toBe(true);
    expect(match.seat("first")).toBe("blue");
    expect(match.advance()?.state.tick).toBe(1);
    expect(
      match.state.squads.find((s) => s.id === "blue-1")?.order?.type,
    ).not.toBe("ATTACK_MOVE");
    match.leave("first");
    expect(match.join("stranger")).toBe("blue");
  });
  it("starts a 3v3 room with human seats and AI filling the empty slots", () => {
    const match = new AuthoritativeMatch("3v3");
    expect(match.join("host")).toBe("blue-1");
    expect(match.join("opponent")).toBe("red-1");
    expect(match.ready).toBe(false);
    expect(match.start("opponent")).toEqual({
      accepted: false,
      reason: "NOT_HOST",
    });
    expect(match.start("host")).toEqual({ accepted: true });
    expect(
      match.lobby.slots.filter((slot) => slot.occupant === "AI"),
    ).toHaveLength(4);
    expect(match.join("late")).toBeNull();
    expect(
      match.submit("host", {
        type: "ATTACK",
        squadIds: ["blue-2-1"],
        targetSquadId: "red-1-1",
      }),
    ).toEqual({ accepted: false, reason: "NOT_OWNER" });
    expect(
      match.submit("host", {
        type: "ATTACK",
        squadIds: ["red-1-1"],
        targetSquadId: "blue-1-1",
      }),
    ).toEqual({ accepted: false, reason: "NOT_OWNER" });
    expect(
      match.submit("host", {
        type: "ATTACK_MOVE",
        squadIds: ["blue-1-1"],
        destination: { x: 10000, y: 6500 },
      }).accepted,
    ).toBe(true);
    expect(match.advance()?.state.tick).toBe(1);
    expect(
      match.state.squads.find((s) => s.id === "blue-2-1")?.order?.type,
    ).toBe("ATTACK_MOVE");
    match.leave("opponent");
    expect(match.lobby.slots.find((s) => s.id === "red-1")?.occupant).toBe(
      "AI",
    );
    expect(match.advance()?.state.tick).toBe(2);
    expect(
      match.state.squads.find((s) => s.id === "red-1-1")?.order?.type,
    ).toBe("ATTACK_MOVE");
  });
  it("assigns six alternating seats and requires both sides before starting", () => {
    const match = new AuthoritativeMatch("3v3");
    expect(match.join("only")).toBe("blue-1");
    expect(match.start("only")).toEqual({
      accepted: false,
      reason: "NEED_OPPONENT",
    });
    for (let i = 2; i <= 6; i++) match.join(`player-${i}`);
    expect(match.lobby.slots.map((slot) => slot.occupant)).toEqual(
      Array(6).fill("human"),
    );
    expect(match.join("seventh")).toBeNull();
    expect(match.start("only")).toEqual({ accepted: true });
    expect(match.ready).toBe(true);
  });
  it("hands lobby ownership to the next connected player", () => {
    const match = new AuthoritativeMatch("3v3");
    match.join("first");
    match.join("second");
    match.leave("first");
    expect(match.isHost("second")).toBe(true);
    expect(match.join("third")).toBe("blue-1");
    expect(match.start("second")).toEqual({ accepted: true });
  });
  it("only the host removes another human before the match starts", () => {
    const match = new AuthoritativeMatch("3v3");
    match.join("host");
    match.join("guest");
    expect(match.removeFromLobby("guest", "blue-1").reason).toBe("NOT_HOST");
    expect(match.removeFromLobby("host", "blue-1").reason).toBe(
      "CANNOT_REMOVE_SELF",
    );
    expect(match.removeFromLobby("host", "blue-3").reason).toBe(
      "INVALID_TARGET",
    );
    match.drop("guest");
    expect(match.start("host").reason).toBe("PLAYERS_DISCONNECTED");
    expect(match.removeFromLobby("host", "red-1")).toEqual({
      accepted: true,
      sessionId: "guest",
    });
    expect(match.reconnect("guest")).toBe(false);
    expect(match.join("replacement")).toBe("red-1");
    expect(match.start("host").accepted).toBe(true);
    expect(match.removeFromLobby("host", "red-1").reason).toBe("MATCH_STARTED");
  });
  it("keeps command sequence when a new session inherits a used 1v1 seat", () => {
    const match = new AuthoritativeMatch();
    match.join("first");
    match.join("opponent");
    match.submit("first", {
      type: "MOVE",
      squadIds: ["blue-1"],
      destination: { x: 9000, y: 4000 },
    });
    match.advance();
    match.leave("first");
    expect(match.join("replacement")).toBe("blue");
    match.submit("replacement", {
      type: "MOVE",
      squadIds: ["blue-1"],
      destination: { x: 10000, y: 4000 },
    });
    expect(
      match
        .advance()
        ?.events.filter((event) => event.type === "COMMAND_REJECTED"),
    ).toEqual([]);
    expect(match.state.squads.find((s) => s.id === "blue-1")?.order?.seq).toBe(
      1,
    );
  });
  it("AI takeover continues after a departed human has issued commands", () => {
    const match = new AuthoritativeMatch("3v3");
    match.join("host");
    match.join("guest");
    match.start("host");
    match.submit("guest", {
      type: "MOVE",
      squadIds: ["red-1-1"],
      destination: { x: 13000, y: 2000 },
    });
    match.advance();
    match.leave("guest");
    expect(
      match
        .advance()
        ?.events.filter((event) => event.type === "COMMAND_REJECTED"),
    ).toEqual([]);
    expect(match.state.squads.find((s) => s.id === "red-1-1")?.order?.seq).toBe(
      1,
    );
  });
});
