import { randomBytes, timingSafeEqual } from "node:crypto";

function validKey(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{64}$/.test(value);
}
function sameKey(expected: string, candidate: unknown): boolean {
  return (
    validKey(candidate) &&
    timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(candidate, "hex"))
  );
}

/** Admission capability for one room. It never enters the battle state or room listing. */
export class InviteAccess {
  key = randomBytes(32).toString("hex");
  private creatorProof: string | null;
  constructor(proof: unknown) {
    if (!validKey(proof)) throw new Error("INVITE_SETUP_REQUIRED");
    this.creatorProof = proof;
  }
  authorize(options: unknown): boolean {
    if (!options || typeof options !== "object" || Array.isArray(options))
      return false;
    const { inviteKey, creatorProof } = options as Record<string, unknown>;
    if (sameKey(this.key, inviteKey)) return true;
    if (this.creatorProof && sameKey(this.creatorProof, creatorProof)) {
      this.creatorProof = null;
      return true;
    }
    return false;
  }
  rotate() {
    this.key = randomBytes(32).toString("hex");
    return this.key;
  }
}
