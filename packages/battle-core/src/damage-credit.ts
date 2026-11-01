export interface DamageClaim {
  claimId: string;
  actorId: string;
  targetId: string;
  damage: number;
}
/** Allocate trusted ordinary-attack claims within actual HP loss; identities deduplicate a tick. */
export function allocateDamageProportionally(
  claims: readonly DamageClaim[],
  actualLoss: Readonly<Record<string, number>>,
) {
  const seen = new Map<string, DamageClaim>(),
    actors = new Map<string, bigint>(),
    targets = new Map<string, Map<string, bigint>>();
  const valid = (x: number) => Number.isSafeInteger(x) && x >= 0;
  for (const value of Object.values(actualLoss))
    if (!valid(value)) throw Error("Invalid effective HP loss");
  for (const claim of claims) {
    if (
      !claim.claimId ||
      !claim.actorId ||
      !claim.targetId ||
      !valid(claim.damage)
    )
      throw Error("Invalid damage claim");
    const old = seen.get(claim.claimId);
    if (old) {
      if (
        old.actorId !== claim.actorId ||
        old.targetId !== claim.targetId ||
        old.damage !== claim.damage
      )
        throw Error("Conflicting claim identity");
      continue;
    }
    seen.set(claim.claimId, claim);
    actors.set(claim.actorId, 0n);
    const group = targets.get(claim.targetId) ?? new Map<string, bigint>();
    group.set(
      claim.actorId,
      (group.get(claim.actorId) ?? 0n) + BigInt(claim.damage),
    );
    targets.set(claim.targetId, group);
  }
  for (const [target, group] of targets) {
    const total = [...group.values()].reduce((a, b) => a + b, 0n);
    if (total === 0n) continue;
    const loss = BigInt(
        Object.hasOwn(actualLoss, target) ? actualLoss[target]! : 0,
      ),
      budget = loss < total ? loss : total;
    const shares = [...group].map(([actorId, damage]) => ({
      actorId,
      amount: (budget * damage) / total,
      remainder: (budget * damage) % total,
    }));
    shares.sort((a, b) =>
      a.remainder > b.remainder
        ? -1
        : a.remainder < b.remainder
          ? 1
          : a.actorId < b.actorId
            ? -1
            : a.actorId > b.actorId
              ? 1
              : 0,
    );
    let remaining = budget - shares.reduce((sum, s) => sum + s.amount, 0n);
    for (const share of shares) {
      if (remaining > 0n) {
        share.amount++;
        remaining--;
      }
      actors.set(share.actorId, actors.get(share.actorId)! + share.amount);
    }
  }
  return [...actors]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([actorId, damage]) => {
      if (damage > BigInt(Number.MAX_SAFE_INTEGER))
        throw Error("Unsafe aggregate damage credit");
      return { actorId, damage: Number(damage) };
    });
}
