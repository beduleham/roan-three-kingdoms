import type { BattleConfig } from "./config.js";
import type { Contact, Squad } from "./model.js";

export function safeInteger(value: bigint): number {
  if (value < 0n || value > BigInt(Number.MAX_SAFE_INTEGER))
    throw new Error("Unsafe integer result");
  return Number(value);
}
export function applyBp(value: number, bp: number): number {
  if (
    !Number.isSafeInteger(value) ||
    value < 0 ||
    !Number.isSafeInteger(bp) ||
    bp < 0
  )
    throw new Error("BP inputs must be nonnegative safe integers");
  return safeInteger((BigInt(value) * BigInt(bp) + 5000n) / 10000n);
}
export function livingSoldiers(
  squad: Pick<Squad, "hpMilli">,
  config: BattleConfig,
): number {
  const hp = BigInt(squad.hpMilli);
  const perSoldier = BigInt(config.soldierHp) * BigInt(config.hpMilliPerHp);
  return safeInteger((hp + perSoldier - 1n) / perSoldier);
}
export function calculateDamage(
  attacker: Squad,
  defender: Squad,
  contact: Contact,
  config: BattleConfig,
  skillBp = 10000,
): number {
  if (
    attacker.hpMilli === 0 ||
    attacker.morale === 0 ||
    attacker.fsmState === "ROUTED" ||
    attacker.fsmState === "BROKEN"
  )
    return 0;
  let matchup = config.matchupBp[attacker.unitType][defender.unitType];
  if (contact.preparedSpear) {
    if (
      attacker.unitType === "spears" &&
      attacker.formation === "defense" &&
      defender.unitType === "cavalry"
    )
      matchup = config.preparedSpearCounter.spearsVsCavalryBp;
    if (
      defender.unitType === "spears" &&
      defender.formation === "defense" &&
      attacker.unitType === "cavalry"
    )
      matchup = config.preparedSpearCounter.cavalryVsSpearsBp;
  }
  const morale =
    attacker.morale >= config.moraleBands.normalFrom
      ? config.moraleDamageBp.normal
      : attacker.morale >= config.moraleBands.waveringFrom
        ? config.moraleDamageBp.wavering
        : config.moraleDamageBp.panicked;
  const defense = BigInt(config.unitTypes[defender.unitType].defense) + 100n;
  const defenseBp = safeInteger((1000000n + defense / 2n) / defense);
  let damage = safeInteger(
    BigInt(livingSoldiers(attacker, config)) *
      BigInt(config.unitTypes[attacker.unitType].dpsPerSoldier) *
      BigInt(config.tickMs),
  );
  for (const bp of [
    config.baseEngagementBp,
    matchup,
    config.directions[contact.direction].damageBp,
    config.formations[attacker.formation].attackBp,
    config.formations[defender.formation].incomingDamageBp,
    10000,
    morale,
    10000,
    skillBp,
    defenseBp,
  ])
    damage = applyBp(damage, bp);
  return damage;
}
