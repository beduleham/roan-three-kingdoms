import { it, expect } from "vitest";
import { GuideProgress } from "../src/beginner-guide.js";
import {
  lobbyReadiness,
  seatName,
  connectionErrorMessage,
} from "../src/lobby-guide.js";
const slot = (id: string, connected = true) => ({
  id,
  occupant: "human",
  connected,
  host: id === "blue-1",
});
it("only marks actual supplied guide observations and resets when the room or seat changes", () => {
  const g = new GuideProgress([
    "connected",
    "started",
    "moved",
    "skill",
    "formation",
    "finished",
  ]);
  g.observe("a", ["connected", "started"]);
  expect(g.complete).toBe(false);
  g.observe("a", ["connected"]);
  expect(g.done.size).toBe(2);
  g.observe("a", ["skill", "moved", "formation", "finished"]);
  expect(g.complete).toBe(true);
  g.observe("other-seat", ["connected"]);
  expect(g.done.size).toBe(1);
  g.reset();
  expect(g.done.size).toBe(0);
});
it("ignores signals outside a local guide's scope instead of fabricating completion", () => {
  const g = new GuideProgress(["started", "moved", "skill", "formation"]);
  g.observe("local", ["connected", "finished"]);
  expect(g.done.size).toBe(0);
  g.observe("local", ["started", "moved", "skill", "formation"]);
  expect(g.complete).toBe(true);
});
it("shows the same three-country quorum and reserved-seat blocker as the server", () => {
  const two = [slot("blue-1"), slot("red-1")];
  expect(lobbyReadiness("national", two, false)).toMatchObject({
    canStart: false,
  });
  expect(lobbyReadiness("national", two, false).reason).toContain("녹국");
  const three = [...two, slot("green-2")];
  expect(lobbyReadiness("national", three, false).canStart).toBe(true);
  three[1]!.connected = false;
  expect(lobbyReadiness("national", three, false).canStart).toBe(false);
  expect(lobbyReadiness("national", three, false).reason).toContain("재접속");
  expect(lobbyReadiness("national", three, true).canStart).toBe(false);
});
it("explains two-team start, immediate duel and localized seat names", () => {
  expect(
    lobbyReadiness("3v3", [slot("blue-1"), slot("red-2")], false).canStart,
  ).toBe(true);
  expect(
    lobbyReadiness("3v3", [slot("blue-1"), slot("blue-2")], false).canStart,
  ).toBe(false);
  expect(
    lobbyReadiness("1v1", [slot("blue"), slot("red")], false).canStart,
  ).toBe(false);
  expect(seatName("green-3")).toBe("녹국 3번");
});

it("explains recoverable admission failures without echoing credentials or raw server text", () => {
  expect(connectionErrorMessage(new Error("INVITE_REQUIRED"))).toContain(
    "최신 링크",
  );
  expect(
    connectionErrorMessage(new Error("ACCOUNT_SESSION_EXPIRED")),
  ).toContain("로그아웃");
  expect(connectionErrorMessage("ROOM_FULL")).toContain("빈 좌석");
  expect(
    connectionErrorMessage("https://host/#invite=secret-token"),
  ).not.toContain("secret-token");
});
