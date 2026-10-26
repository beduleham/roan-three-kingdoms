import { describe, it, expect } from "vitest";
import { squadFeedback, feedbackPolicy } from "../src/squad-feedback.js";
describe("combat state feedback", () => {
  it.each(["ROUTED", "BROKEN", "REGROUP"] as const)(
    "%s suppresses a stale attack pose",
    (fsmState) =>
      expect(
        squadFeedback({ hpMilli: 100, fsmState }, 10, 10).attackAllowed,
      ).toBe(false),
  );
  it("death takes precedence over rout and hit", () =>
    expect(
      squadFeedback({ hpMilli: 0, fsmState: "ROUTED" }, 10, 10),
    ).toMatchObject({
      state: "DEFEATED",
      label: "전멸",
      alpha: 0,
      attackAllowed: false,
    }));
  it("briefly flashes after real damage and then clears", () => {
    const s = { hpMilli: 100, fsmState: "ENGAGE" as const };
    expect(squadFeedback(s, 10, 10).tint).toBe(feedbackPolicy.hitTint);
    expect(squadFeedback(s, 12, 10).tint).toBe(feedbackPolicy.normalTint);
  });
  it("does not show a future damage event", () =>
    expect(
      squadFeedback({ hpMilli: 100, fsmState: "IDLE" }, 10, 11).label,
    ).toBe(""));
  it("keeps rout readable while receiving damage", () =>
    expect(
      squadFeedback({ hpMilli: 100, fsmState: "ROUTED" }, 10, 10),
    ).toMatchObject({ label: "패주", alpha: 0.8 }));
  it("allows ordinary attacks and does not mutate state", () => {
    const s = { hpMilli: 100, fsmState: "ENGAGE" as const };
    expect(squadFeedback(s, 10).attackAllowed).toBe(true);
    expect(s).toEqual({ hpMilli: 100, fsmState: "ENGAGE" });
  });
});
