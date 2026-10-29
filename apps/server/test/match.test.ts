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
});
