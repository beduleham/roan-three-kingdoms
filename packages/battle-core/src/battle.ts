import { parseBattleConfig, type BattleConfig } from "./config.js";
import {
  commandSchema,
  natural,
  scenarioSchema,
  type BattleEvent,
  type BattleInput,
  type BattleScenario,
  type BattleState,
  type Contact,
  type Squad,
  type StepResult,
} from "./model.js";
import { calculateDamage, livingSoldiers, safeInteger } from "./damage.js";
import { canonicalJson } from "./canonical.js";

const compare = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
const contactKey = (a: string, b: string) => JSON.stringify([a, b]);
const clamp = (n: number) => Math.max(0, Math.min(100, n));

function validate(state: BattleState): void {
  natural.parse(state.tick);
  natural.parse(state.seed);
  parseBattleConfig(state.config);
  scenarioSchema.parse({
    players: state.players,
    squads: state.squads,
    commanders: state.commanders,
    contacts: state.contacts,
  });
  for (const entries of [state.players, state.squads, state.commanders]) {
    if (new Set(entries.map((x) => x.id)).size !== entries.length)
      throw new Error("Duplicate entity ID");
  }
  const players = new Map(state.players.map((x) => [x.id, x]));
  const squads = new Map(state.squads.map((x) => [x.id, x]));
  for (const squad of state.squads) {
    if (players.get(squad.ownerPlayerId)?.nationId !== squad.nationId)
      throw new Error("Invalid squad owner/nation");
    const maxHp =
      BigInt(squad.maxSoldiers) *
      BigInt(state.config.soldierHp) *
      BigInt(state.config.hpMilliPerHp);
    safeInteger(maxHp);
    if (BigInt(squad.hpMilli) > maxHp) throw new Error("HP exceeds maximum");
    if (squad.hpMilli === 0 && squad.fsmState !== "DEFEATED")
      throw new Error("Dead squad must be DEFEATED");
    if (squad.hpMilli > 0 && squad.fsmState === "DEFEATED")
      throw new Error("Living squad cannot be DEFEATED");
    if (squad.morale === 0 && squad.hpMilli > 0 && squad.fsmState !== "ROUTED")
      throw new Error("Zero morale must be ROUTED");
  }
  for (const player of state.players) {
    const owned = state.squads.filter(
      (s) => s.ownerPlayerId === player.id && s.hpMilli > 0,
    );
    const cap = state.config.rankCaps[player.rank];
    if (
      owned.length > cap.squads ||
      owned.reduce((n, s) => n + livingSoldiers(s, state.config), 0) >
        cap.soldiers
    )
      throw new Error("Rank capacity exceeded");
  }
  for (const commander of state.commanders) {
    if (
      !players.has(commander.ownerPlayerId) ||
      commander.hpMilli > commander.maxHpMilli ||
      (commander.assignedSquadId !== null &&
        squads.get(commander.assignedSquadId)?.ownerPlayerId !==
          commander.ownerPlayerId)
    )
      throw new Error("Invalid commander");
  }
  const keys = new Set<string>();
  for (const contact of state.contacts) {
    const a = squads.get(contact.attackerId),
      b = squads.get(contact.targetId);
    const key = contactKey(contact.attackerId, contact.targetId);
    if (!a || !b || a.nationId === b.nationId || keys.has(key))
      throw new Error("Invalid or duplicate contact");
    keys.add(key);
  }
  if (
    state.impactedContacts.some((key) => !keys.has(key)) ||
    new Set(state.impactedContacts).size !== state.impactedContacts.length
  )
    throw new Error("Invalid contact history");
}
function normalizeStatus(s: Squad, config: BattleConfig): Squad["fsmState"] {
  if (s.hpMilli === 0) {
    s.fsmState = "DEFEATED";
    s.statusRemainingTicks = 0;
    s.breakImmunityTicks = 0;
  } else if (s.morale === 0 && s.fsmState !== "ROUTED") {
    s.fsmState = "ROUTED";
    s.statusRemainingTicks = config.status.routTicks;
    s.breakImmunityTicks = 0;
  } else if (
    s.cohesion === 0 &&
    s.breakImmunityTicks === 0 &&
    s.fsmState === "IDLE"
  ) {
    s.fsmState = "BROKEN";
    s.statusRemainingTicks = config.status.breakTicks;
  }
  return s.fsmState;
}
export function createBattle(
  config: BattleConfig,
  seed: number,
  scenario: BattleScenario = {},
): BattleState {
  const parsed = scenarioSchema.parse(scenario);
  const state: BattleState = {
    config: parseBattleConfig(config),
    seed: natural.parse(seed),
    tick: 0,
    ...parsed,
    impactedContacts: [],
  };
  for (const s of state.squads) normalizeStatus(s, state.config);
  for (const list of [state.players, state.squads, state.commanders])
    list.sort((a, b) => compare(a.id, b.id));
  state.contacts.sort((a, b) =>
    compare(
      contactKey(a.attackerId, a.targetId),
      contactKey(b.attackerId, b.targetId),
    ),
  );
  validate(state);
  return state;
}

/** ATTACK is a one-tick headless intent. Contacts are trusted scenario data, never client commands. */
export function step(
  input: BattleState,
  commands: readonly BattleInput[],
): StepResult {
  validate(input);
  const state = structuredClone(input);
  const events: BattleEvent[] = [];
  const config = state.config;
  const emit = (event: Omit<BattleEvent, "tick">) =>
    events.push({ tick: state.tick, ...event });
  const squads = new Map(state.squads.map((s) => [s.id, s]));
  const players = new Map(state.players.map((p) => [p.id, p]));
  const contacts = new Map(
    state.contacts.map((c) => [contactKey(c.attackerId, c.targetId), c]),
  );
  const attacks = new Map<
    string,
    { target: Squad; contact: Contact; seq: number }
  >();
  const valid: BattleInput[] = [];
  let malformed = 0;
  for (const raw of commands) {
    const result = commandSchema.safeParse(raw);
    if (!result.success) {
      malformed++;
      continue;
    }
    result.data.command.squadIds.sort(compare);
    valid.push(result.data);
  }
  valid.sort(
    (a, b) =>
      a.command.seq - b.command.seq ||
      compare(a.playerId, b.playerId) ||
      compare(a.command.squadIds[0]!, b.command.squadIds[0]!) ||
      compare(canonicalJson(a), canonicalJson(b)),
  );
  for (let i = 0; i < malformed; i++)
    emit({ type: "COMMAND_REJECTED", actorId: "", reason: "INVALID_COMMAND" });
  const counts = new Map<string, number>();
  for (const c of valid) {
    const key = contactKey(c.playerId, String(c.command.seq));
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  for (const envelope of valid) {
    const { playerId, command: cmd } = envelope;
    const player = players.get(playerId);
    const owned = cmd.squadIds.map((id) => squads.get(id));
    const target = squads.get(cmd.targetSquadId);
    let reason: string | undefined;
    if (!player) reason = "UNKNOWN_PLAYER";
    else if (counts.get(contactKey(playerId, String(cmd.seq)))! > 1)
      reason = "DUPLICATE_SEQ";
    else if (cmd.seq <= player.lastCommandSeq) reason = "STALE_SEQ";
    else if (cmd.requestedTick !== state.tick) reason = "WRONG_TICK";
    else if (new Set(cmd.squadIds).size !== cmd.squadIds.length)
      reason = "DUPLICATE_SQUAD";
    else if (owned.some((s) => !s || s.ownerPlayerId !== playerId))
      reason = "NOT_OWNER";
    else if (
      !target ||
      target.hpMilli === 0 ||
      target.nationId === player.nationId
    )
      reason = "INVALID_TARGET";
    else if (owned.some((s) => s!.fsmState !== "IDLE" || s!.hpMilli === 0))
      reason = "FORCED_STATE";
    else if (owned.some((s) => !contacts.has(contactKey(s!.id, target.id))))
      reason = "NO_CONTACT";
    if (reason) {
      emit({
        type: "COMMAND_REJECTED",
        actorId: playerId,
        sourceCommandSeq: cmd.seq,
        reason,
      });
      continue;
    }
    player!.lastCommandSeq = cmd.seq;
    for (const s of owned) {
      attacks.set(s!.id, {
        target: target!,
        contact: contacts.get(contactKey(s!.id, target!.id))!,
        seq: cmd.seq,
      });
      emit({
        type: "ORDER_ACCEPTED",
        actorId: s!.id,
        targetId: target!.id,
        sourceCommandSeq: cmd.seq,
      });
    }
  }
  const deltas = new Map<
    string,
    { hp: bigint; morale: number; cohesion: number }
  >();
  const impacted: string[] = [];
  // All attacks read the same pre-damage snapshot.
  for (const attacker of [...state.squads].sort((a, b) =>
    compare(a.id, b.id),
  )) {
    const attack = attacks.get(attacker.id);
    if (!attack) continue;
    const damage = calculateDamage(
      attacker,
      attack.target,
      attack.contact,
      config,
    );
    const key = contactKey(attacker.id, attack.target.id);
    const delta = deltas.get(attack.target.id) ?? {
      hp: 0n,
      morale: 0,
      cohesion: 0,
    };
    delta.hp += BigInt(damage);
    if (damage > 0) {
      impacted.push(key);
      if (!state.impactedContacts.includes(key)) {
        delta.morale +=
          config.directions[attack.contact.direction].moraleImpact;
        delta.cohesion +=
          config.directions[attack.contact.direction].cohesionImpact;
      }
    }
    deltas.set(attack.target.id, delta);
    emit({
      type: "ATTACK_HIT",
      actorId: attacker.id,
      targetId: attack.target.id,
      sourceCommandSeq: attack.seq,
      delta: -damage,
    });
  }
  state.impactedContacts = impacted.sort(compare);
  for (const s of state.squads) {
    const previousState = s.fsmState;
    const immunity = s.breakImmunityTicks;
    const delta = deltas.get(s.id);
    if (delta) {
      s.hpMilli = Number(
        BigInt(s.hpMilli) > delta.hp ? BigInt(s.hpMilli) - delta.hp : 0n,
      );
      const morale = s.morale,
        cohesion = s.cohesion;
      s.morale = clamp(s.morale - delta.morale);
      s.cohesion = clamp(s.cohesion - delta.cohesion);
      if (s.morale !== morale)
        emit({
          type: "MORALE_CHANGED",
          actorId: s.id,
          delta: s.morale - morale,
        });
      if (s.cohesion !== cohesion)
        emit({
          type: "COHESION_CHANGED",
          actorId: s.id,
          delta: s.cohesion - cohesion,
        });
    }
    normalizeStatus(s, config);
    if (s.fsmState !== previousState) {
      const type =
        s.fsmState === "DEFEATED"
          ? "SQUAD_DEFEATED"
          : s.fsmState === "ROUTED"
            ? "SQUAD_ROUTED"
            : "SQUAD_BROKEN";
      emit({ type, actorId: s.id });
    } else if (s.fsmState === "ROUTED" || s.fsmState === "BROKEN") {
      s.statusRemainingTicks = Math.max(0, s.statusRemainingTicks - 1);
      if (
        s.statusRemainingTicks === 0 &&
        (s.fsmState === "BROKEN" || (s.safe && !delta))
      ) {
        if (s.fsmState === "ROUTED")
          s.morale = config.status.routRecoveryMorale;
        else {
          s.cohesion = Math.max(
            s.cohesion,
            config.status.breakRecoveryCohesion,
          );
          s.breakImmunityTicks = config.status.breakImmunityTicks;
        }
        s.fsmState = "IDLE";
        emit({ type: "SQUAD_RECOVERED", actorId: s.id });
        const recoveredStatus = normalizeStatus(s, config);
        if (recoveredStatus === "BROKEN")
          emit({ type: "SQUAD_BROKEN", actorId: s.id });
      }
    }
    if (delta && delta.hp > 0n) {
      s.ticksSinceDamage = 0;
      s.cohesionRecoveryRemainder = 0;
      s.moraleRecoveryRemainder = 0;
    } else {
      s.ticksSinceDamage = Math.min(
        Number.MAX_SAFE_INTEGER,
        s.ticksSinceDamage + 1,
      );
      if (s.hpMilli > 0 && s.fsmState === "IDLE" && previousState === "IDLE") {
        for (const [field, remainder, rate, allowed] of [
          [
            "cohesion",
            "cohesionRecoveryRemainder",
            config.status.cohesionRecoveryPerSecond,
            s.ticksSinceDamage >= config.status.regroupDelayTicks,
          ],
          [
            "morale",
            "moraleRecoveryRemainder",
            config.status.safeMoraleRecoveryPerSecond,
            s.safe,
          ],
        ] as const) {
          if (!allowed) {
            s[remainder] = 0;
            continue;
          }
          const total =
            BigInt(s[remainder]) + BigInt(rate) * BigInt(config.tickMs);
          const previous = s[field];
          s[field] = Number(
            BigInt(previous) + total / 1000n > 100n
              ? 100n
              : BigInt(previous) + total / 1000n,
          );
          s[remainder] = s[field] === 100 ? 0 : Number(total % 1000n);
          if (s[field] !== previous)
            emit({
              type: field === "morale" ? "MORALE_CHANGED" : "COHESION_CHANGED",
              actorId: s.id,
              delta: s[field] - previous,
            });
        }
      }
    }
    if (immunity > 0 && s.breakImmunityTicks === immunity) {
      s.breakImmunityTicks--;
      if (
        s.breakImmunityTicks === 0 &&
        s.fsmState === "IDLE" &&
        s.cohesion === 0
      ) {
        normalizeStatus(s, config);
        emit({ type: "SQUAD_BROKEN", actorId: s.id });
      }
    }
  }
  state.tick = safeInteger(BigInt(state.tick) + 1n);
  validate(state);
  return { state, events };
}
