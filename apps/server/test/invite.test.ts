import { describe, expect, it } from "vitest";
import { InviteAccess } from "../src/invite.js";

describe("room invitation admission", () => {
  it("requires a creator proof once or the current room key", () => {
    const proof = "a".repeat(64);
    const invite = new InviteAccess(proof);
    expect(invite.authorize({})).toBe(false);
    expect(invite.authorize({ inviteKey: "bad" })).toBe(false);
    expect(invite.authorize({ creatorProof: proof })).toBe(true);
    expect(invite.authorize({ creatorProof: proof })).toBe(false);
    expect(invite.authorize({ inviteKey: invite.key })).toBe(true);
  });
  it("rotation revokes the old key and keys cannot authorize another room", () => {
    const first = new InviteAccess("b".repeat(64));
    const other = new InviteAccess("c".repeat(64));
    const old = first.key;
    expect(other.authorize({ inviteKey: old })).toBe(false);
    first.rotate();
    expect(first.authorize({ inviteKey: old })).toBe(false);
    expect(first.authorize({ inviteKey: first.key })).toBe(true);
    expect(() => new InviteAccess(undefined)).toThrow("INVITE_SETUP_REQUIRED");
  });
});
