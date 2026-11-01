import { it, expect } from "vitest";
import { AuthoritativeMatch } from "../src/match.js";
it("moves only the caller to an available pre-game seat and keeps session host authority", () => {
  const m = new AuthoritativeMatch("national");
  m.join("host");
  m.join("red");
  const before = JSON.stringify(m.state);
  expect(m.changeSeat("host", "green-2")).toEqual({ accepted: true });
  expect(m.changeSeat("host", "green-2")).toEqual({ accepted: true });
  expect(m.seat("host")).toBe("green-2");
  expect(m.nation("host")).toBe("green");
  expect(m.isHost("host")).toBe(true);
  expect(m.seat("red")).toBe("red-1");
  expect(JSON.stringify(m.state)).toBe(before);
  expect(
    m.view("green").nationalMatch!.players.every((p) => p.nationId === "green"),
  ).toBe(true);
});
it("does not steal connected or reserved seats and resolves competing choices sequentially", () => {
  const m = new AuthoritativeMatch("national");
  m.join("a");
  m.join("b");
  expect(m.changeSeat("a", "red-1").reason).toBe("SEAT_OCCUPIED");
  m.drop("b");
  expect(m.changeSeat("a", "red-1").reason).toBe("SEAT_OCCUPIED");
  expect(m.changeSeat("b", "green-1").reason).toBe("NO_SEAT");
  m.reconnect("b");
  expect(m.changeSeat("a", "green-1").accepted).toBe(true);
  expect(m.changeSeat("b", "green-1").reason).toBe("SEAT_OCCUPIED");
});
it("retains nation start requirements, rejects malformed/outsider/in-game swaps and freezes human ranking seats at start", () => {
  const m = new AuthoritativeMatch("national");
  m.join("a");
  m.join("b");
  m.join("c");
  expect(m.changeSeat("alien", "blue-3").reason).toBe("NO_SEAT");
  for (const x of [null, {}, ["blue-2"], "__proto__", "orange-1"])
    expect(m.changeSeat("a", x).accepted).toBe(false);
  m.changeSeat("c", "blue-2");
  expect(m.start("a").reason).toBe("NEED_THREE_NATIONS");
  m.changeSeat("c", "green-3");
  expect(m.start("a").accepted).toBe(true);
  expect(m.national!.humanIds).toContain("green-3");
  expect(m.changeSeat("b", "red-2").reason).toBe("MATCH_STARTED");
  expect(
    m.submit("c", {
      type: "MOVE",
      squadIds: ["green-1-1"],
      destination: { x: 1000, y: 1000 },
    }).reason,
  ).toBe("NOT_OWNER");
  expect(
    m.submit("c", {
      type: "MOVE",
      squadIds: ["green-3-1"],
      destination: { x: 1000, y: 1000 },
    }).accepted,
  ).toBe(true);
});
it("supports two-team lobby selection but keeps immediate 1v1 seats fixed", () => {
  const m = new AuthoritativeMatch("3v3");
  m.join("a");
  m.join("b");
  expect(m.changeSeat("b", "blue-2").accepted).toBe(true);
  expect(m.start("a").reason).toBe("NEED_OPPONENT");
  const duel = new AuthoritativeMatch();
  duel.join("a");
  expect(duel.changeSeat("a", "red").reason).toBe("INVALID_MODE");
});
