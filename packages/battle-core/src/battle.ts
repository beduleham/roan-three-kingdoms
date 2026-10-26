import { cohesionDamageBp, reduceCohesionDamage } from "./augments.js";
import {
  offerAugments,
  selectAugment,
  expireAugments,
  processAugmentEvents,
} from "./augments.js";
import { parseBattleConfig, type BattleConfig } from "./config.js";
import {
  commandSchema,
  natural,
  scenarioSchema,
  skillEffectSchema,
  type BattleEvent,
  type BattleInput,
  type BattleScenario,
  type BattleState,
  type Squad,
  type StepResult,
} from "./model.js";
import { calculateDamage, livingSoldiers, safeInteger } from "./damage.js";
import { acceptOrder, advanceOrders } from "./orders.js";
import {
  contactFor,
  forced,
  isSafe,
  rangeUnits,
  speedUnits,
} from "./spatial.js";
import { skillMultiplier } from "./effects.js";
import {
  initializeCommanders,
  beginWarriorTick,
  synchronizeCommanders,
  validateWarriorCommand,
  acceptWarriorCommand,
  cancelCharge,
  resolveCharges,
  splitCommanderDamage,
  finishWarriorTick,
} from "./warrior.js";
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
    safeZones: state.safeZones,
    augmentDefinitions: state.augmentDefinitions,
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
  if (
    new Set(state.commanders.map((c) => c.ownerPlayerId)).size !==
    state.commanders.length
  )
    throw new Error("One commander per player is supported");
  for (const c of state.commanders) {
    if (
      c.reassignTargetId !== null &&
      squads.get(c.reassignTargetId)?.ownerPlayerId !== c.ownerPlayerId
    )
      throw new Error("Invalid reassignment target");
    if ((c.hpMilli === 0) !== (c.status === "WOUNDED"))
      throw new Error("Inconsistent commander injury");
    if (c.respawnZoneIndex !== null) {
      const zone = state.safeZones[c.respawnZoneIndex];
      if (!zone || zone.nationId !== players.get(c.ownerPlayerId)?.nationId)
        throw new Error("Invalid friendly respawn zone");
    }
  }
  for (const e of state.skillEffects) {
    skillEffectSchema.parse(e);
    if (
      !state.commanders.some((c) => c.id === e.sourceCommanderId) ||
      e.targetSquadIds.some((id) => !squads.has(id))
    )
      throw new Error("Invalid effect reference");
  }
  for (const s of state.squads) {
    if (
      s.charge &&
      (!state.commanders.some((c) => c.id === s.charge!.sourceCommanderId) ||
        !squads.has(s.charge.targetSquadId))
    )
      throw new Error("Invalid charge reference");
  }
  if (new Set(state.impactedContacts).size !== state.impactedContacts.length)
    throw new Error("Invalid contact history");
  for (const key of state.impactedContacts) {
    const pair: unknown = JSON.parse(key);
    if (
      !Array.isArray(pair) ||
      pair.length !== 2 ||
      pair.some((id) => typeof id !== "string" || !squads.has(id))
    )
      throw new Error("Invalid contact history");
  }
  for (const squad of state.squads) {
    rangeUnits(squad, state.config);
    speedUnits(squad, state.config);
    if (
      (squad.pendingFormation === null) !==
      (squad.formationRemainingTicks === 0)
    )
      throw new Error("Inconsistent formation transition");
  }
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
    s.fsmState !== "ROUTED" &&
    s.fsmState !== "BROKEN"
  ) {
    s.fsmState = "BROKEN";
    s.statusRemainingTicks = config.status.breakTicks;
  }
  if (forced(s)) {
    s.order = null;
    s.currentTargetId = null;
    if (s.pendingFormation !== null) s.formation = "normal";
    s.pendingFormation = null;
    s.formationRemainingTicks = 0;
    s.regroupRemainingTicks = 0;
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
    augmentProgress: [],
    augmentEffects: [],
    augmentProcessedTick: -1,
    skillEffects: [],
  };
  for (const s of state.squads) normalizeStatus(s, state.config);
  for (const list of [state.players, state.squads, state.commanders])
    list.sort((a, b) => compare(a.id, b.id));
  initializeCommanders(state);
  offerAugments(state, () => {});
  validate(state);
  return state;
}

/** Persistent orders, snapshot-based spatial decisions, then simultaneous combat. */
export function step(
  input: BattleState,
  commands: readonly BattleInput[],
): StepResult {
  validate(input);
  const state = structuredClone(input);
  const events: BattleEvent[] = [];
  const config = state.config;
  state.squads.sort((a, b) => compare(a.id, b.id));
  const previousFSM = new Map(state.squads.map((s) => [s.id, s.fsmState]));
  const previousTargets = new Map(
    state.squads.map((s) => [s.id, s.currentTargetId]),
  );
  const emit = (event: Omit<BattleEvent, "tick">) =>
    events.push({ tick: state.tick, ...event });
  state.commanders.sort((a, b) => compare(a.id, b.id));
  beginWarriorTick(state, emit);
  expireAugments(state, emit);
  offerAugments(state, emit);
  const squads = new Map(state.squads.map((s) => [s.id, s]));
  const players = new Map(state.players.map((p) => [p.id, p]));
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
      compare(a.command.squadIds[0] ?? "", b.command.squadIds[0] ?? "") ||
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
    const target =
      cmd.type === "ATTACK" ? squads.get(cmd.targetSquadId) : undefined;
    let reason: string | undefined;
    if (!player) reason = "UNKNOWN_PLAYER";
    else if (counts.get(contactKey(playerId, String(cmd.seq)))! > 1)
      reason = "DUPLICATE_SEQ";
    else if (cmd.seq <= player.lastCommandSeq) reason = "STALE_SEQ";
    else if (cmd.requestedTick !== state.tick) reason = "WRONG_TICK";
    else if (new Set(cmd.squadIds).size !== cmd.squadIds.length)
      reason = "DUPLICATE_SQUAD";
    else if (cmd.type === "SELECT_AUGMENT")
      reason = selectAugment(state, playerId, cmd.checkpoint, cmd.augmentId);
    else if (cmd.type === "CAST_SKILL" || cmd.type === "REASSIGN_COMMANDER")
      reason = validateWarriorCommand(state, playerId, cmd);
    else if (owned.some((s) => !s || s.ownerPlayerId !== playerId))
      reason = "NOT_OWNER";
    else if (
      cmd.type === "ATTACK" &&
      (!target || target.hpMilli === 0 || target.nationId === player.nationId)
    )
      reason = "INVALID_TARGET";
    else if (owned.some((s) => forced(s!))) reason = "FORCED_STATE";
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
    if (cmd.type === "SELECT_AUGMENT") {
      const progress = state.augmentProgress.find(
        (p) => p.playerId === playerId,
      )!;
      progress.selected.push(cmd.augmentId);
      progress.spent++;
      progress.offer = null;
      emit({
        type: "AUGMENT_SELECTED",
        actorId: playerId,
        effectId: cmd.augmentId,
        sourceCommandSeq: cmd.seq,
      });
      continue;
    }
    if (cmd.type === "CAST_SKILL" || cmd.type === "REASSIGN_COMMANDER") {
      acceptWarriorCommand(state, cmd, emit);
      expireAugments(state, emit);
      continue;
    }
    for (const s of owned) {
      cancelCharge(s!, emit, "DIRECT_ORDER");
      acceptOrder(s!, cmd, state);
      emit({
        type: "ORDER_ACCEPTED",
        actorId: s!.id,
        ...(target ? { targetId: target.id } : {}),
        sourceCommandSeq: cmd.seq,
      });
    }
  }
  expireAugments(state, emit);
  const beforeMovement = new Map(
    state.squads.map((s) => [s.id, { ...s.position }]),
  );
  advanceOrders(state);
  synchronizeCommanders(state, emit);
  const { deltas, moraleSources } = resolveCharges(state, beforeMovement, emit);
  const cohesionBp = new Map(
    state.squads.map((s) => [s.id, cohesionDamageBp(state, s)]),
  );
  // Q resolves before basic attacks. All Q impacts use the same movement snapshot.
  const combat = new Map(
    state.squads.map((s) => {
      const q = deltas.get(s.id);
      const copy = {
        ...s,
        morale: clamp(s.morale - (q?.morale ?? 0)),
        cohesion: clamp(
          s.cohesion -
            reduceCohesionDamage(q?.cohesion ?? 0, cohesionBp.get(s.id)!),
        ),
      };
      if (
        copy.morale === 0 ||
        (copy.cohesion === 0 && copy.breakImmunityTicks === 0)
      )
        copy.fsmState = "BROKEN";
      return [s.id, copy] as const;
    }),
  );
  const impacted: string[] = [];
  // All attacks read the same pre-damage snapshot.
  for (const attacker of [...state.squads].sort((a, b) =>
    compare(a.id, b.id),
  )) {
    if (attacker.fsmState !== "ENGAGE" || forced(attacker)) continue;
    const target = squads.get(attacker.currentTargetId ?? "");
    if (!target || target.hpMilli === 0) continue;
    if (forced(combat.get(attacker.id)!)) continue;
    const contact = contactFor(attacker, target);
    const damage = calculateDamage(
      combat.get(attacker.id)!,
      target,
      contact,
      config,
      skillMultiplier(state, attacker, "attack"),
    );
    const key = contactKey(attacker.id, target.id);
    const delta = deltas.get(target.id) ?? {
      hp: 0n,
      morale: 0,
      cohesion: 0,
    };
    delta.hp += BigInt(damage);
    if (damage > 0) {
      impacted.push(key);
      if (!state.impactedContacts.includes(key)) {
        delta.morale += config.directions[contact.direction].moraleImpact;
        delta.cohesion += config.directions[contact.direction].cohesionImpact;
        if (config.directions[contact.direction].moraleImpact > 0) {
          const sources = moraleSources.get(target.id) ?? new Set<string>();
          sources.add(attacker.id);
          moraleSources.set(target.id, sources);
        }
      }
    }
    deltas.set(target.id, delta);
    emit({
      type: "ATTACK_HIT",
      actorId: attacker.id,
      targetId: target.id,
      ...(attacker.order ? { sourceCommandSeq: attacker.order.seq } : {}),
      delta: -damage,
    });
  }
  state.impactedContacts = impacted.sort(compare);
  const commanderDamage = splitCommanderDamage(state, deltas);
  const routed = new Set<string>();
  // Safety sees all simultaneous deaths, not partially applied damage.
  const safetySnapshot = structuredClone(state);
  for (const s of safetySnapshot.squads) {
    const damage = deltas.get(s.id)?.hp ?? 0n;
    s.hpMilli = Number(
      BigInt(s.hpMilli) > damage ? BigInt(s.hpMilli) - damage : 0n,
    );
  }
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
      s.cohesion = clamp(
        s.cohesion -
          reduceCohesionDamage(delta.cohesion, cohesionBp.get(s.id)!),
      );
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
      if (type === "SQUAD_ROUTED") routed.add(s.id);
    } else if (s.fsmState === "ROUTED" || s.fsmState === "BROKEN") {
      s.statusRemainingTicks = Math.max(0, s.statusRemainingTicks - 1);
      if (
        s.statusRemainingTicks === 0 &&
        (s.fsmState === "BROKEN" || (isSafe(s, safetySnapshot) && !delta))
      ) {
        if (s.fsmState === "ROUTED") {
          s.morale = config.status.routRecoveryMorale;
          s.anchor = { ...s.position };
        } else {
          s.cohesion = Math.max(
            s.cohesion,
            config.status.breakRecoveryCohesion,
          );
          s.breakImmunityTicks = config.status.breakImmunityTicks;
        }
        s.fsmState = "REGROUP";
        s.regroupRemainingTicks = config.status.regroupDelayTicks;
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
      if (
        s.hpMilli > 0 &&
        !forced(s) &&
        previousState !== "BROKEN" &&
        previousState !== "ROUTED" &&
        s.fsmState !== "ENGAGE"
      ) {
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
            isSafe(s, safetySnapshot),
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
      if (s.breakImmunityTicks === 0 && !forced(s) && s.cohesion === 0) {
        normalizeStatus(s, config);
        emit({ type: "SQUAD_BROKEN", actorId: s.id });
      }
    }
  }
  for (const s of state.squads) {
    if (s.pendingFormation !== null && !forced(s)) {
      s.formationRemainingTicks--;
      if (s.formationRemainingTicks === 0) {
        s.formation = s.pendingFormation;
        s.pendingFormation = null;
        emit({ type: "FORMATION_COMPLETED", actorId: s.id });
      }
    }
    if (previousFSM.get(s.id) !== s.fsmState)
      emit({ type: "FSM_CHANGED", actorId: s.id, reason: s.fsmState });
    if (
      s.currentTargetId !== null &&
      previousTargets.get(s.id) !== s.currentTargetId
    )
      emit({
        type: "TARGET_ACQUIRED",
        actorId: s.id,
        targetId: s.currentTargetId,
      });
  }
  finishWarriorTick(state, commanderDamage, routed, moraleSources, emit);
  expireAugments(state, emit);
  processAugmentEvents(state, [...events], emit);
  offerAugments(state, emit);
  state.tick = safeInteger(BigInt(state.tick) + 1n);
  validate(state);
  return { state, events };
}
