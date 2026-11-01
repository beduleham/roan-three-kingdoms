// Offline interventions only. Production routing, map and clock stay unchanged.
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import assert from "node:assert/strict";
import { AuthoritativeMatch, nationalSlots } from "../dist/match.js";
import { snapshotNationalMetrics } from "../dist/national-audit.js";
const rules = JSON.parse(
  readFileSync(new URL("../../../national_demo.v1.json", import.meta.url)),
);
const nations = ["blue", "red", "green"];
const permutations = [
  [0, 1, 2],
  [0, 2, 1],
  [1, 0, 2],
  [1, 2, 0],
  [2, 0, 1],
  [2, 1, 0],
];
const gateOnly = process.argv.includes("--gate-only");
const repeatedRecovery = process.argv.includes("--repeated-recovery");
assert(!(gateOnly && repeatedRecovery), "Choose one experiment axis");
function run(roles, fullClock = false, gate = false) {
  const profile = structuredClone(rules);
  if (fullClock) profile.unifyAfterTick = profile.checkpoints[2] + 1;
  const m = new AuthoritativeMatch("national", undefined, profile, 41);
  nationalSlots.forEach((_, i) => m.join(String(i)));
  m.start("0");
  const firstWipe = {},
    recoveries = [],
    attempts = new Set(),
    samples = [];
  const options = () =>
    m.objectiveMatch.points.filter(
      (p) => !Object.values(profile.bases).includes(p.id),
    );
  // Exactly the existing macro formula; only nation-to-role index is intervened on.
  function command(seat) {
    const nation = seat.split("-")[0],
      slot = Number(seat.at(-1)) - 1;
    const points = options(),
      preferred =
        points[(slot + roles[nations.indexOf(nation)]) % points.length];
    const target =
      preferred.owner === nation
        ? (points.find((p) => p.open && p.owner !== nation) ?? preferred)
        : preferred;
    if (gate && !target.open) return null;
    const squadIds = m.state.squads
      .filter((s) => s.ownerPlayerId === seat && s.hpMilli > 0)
      .map((s) => s.id);
    return squadIds.length
      ? { type: "ATTACK_MOVE", squadIds, destination: { ...target.position } }
      : null;
  }
  const captureChanges = [];
  let owners = JSON.stringify(m.objectiveMatch.points.map((p) => p.owner));
  while (m.ready) {
    if (m.state.tick % profile.aiEveryTicks === 0)
      for (const [i, seat] of nationalSlots.entries()) {
        const c = command(seat);
        if (c) m.submit(String(i), c);
        else if (
          (repeatedRecovery || !attempts.has(seat)) &&
          !m.state.squads.some(
            (s) => s.ownerPlayerId === seat && s.hpMilli > 0,
          ) &&
          m.state.players.find((p) => p.id === seat).supplyPoints >=
            profile.recruitCost
        ) {
          attempts.add(seat);
          const accepted = m.submit(String(i), {
            type: "RECRUIT",
            unitType: "spears",
            squadIds: [],
          });
          recoveries.push({ seat, tick: m.state.tick, ...accepted });
        }
      }
    m.advance();
    assert(m.state.tick <= profile.checkpoints[2]);
    for (const s of nationalSlots)
      if (
        !(s in firstWipe) &&
        !m.state.squads.some((u) => u.ownerPlayerId === s && u.hpMilli > 0)
      )
        firstWipe[s] = m.state.tick;
    const next = JSON.stringify(m.objectiveMatch.points.map((p) => p.owner));
    if (next !== owners) {
      captureChanges.push({
        tick: m.state.tick,
        owners: Object.fromEntries(
          m.objectiveMatch.points.map((p) => [p.id, p.owner]),
        ),
      });
      owners = next;
    }
    if ([3000, 6000, 9000, 10800, 12600].includes(m.state.tick))
      samples.push({
        tick: m.state.tick,
        players: snapshotNationalMetrics(m.state, m.national),
      });
  }
  assert.equal(m.national.ranking.length, 9);
  assert.equal(m.national.jobs.length, 0);
  const players = snapshotNationalMetrics(m.state, m.national);
  for (const p of players) {
    assert(p.squads <= p.squadCap);
    assert(p.soldiers <= p.soldierCap);
  }
  return {
    roles,
    fullClock,
    gate,
    tick: m.state.tick,
    result: m.objectiveMatch.result,
    firstWipe,
    recoveries,
    samples,
    players,
    captureChanges,
    hash: createHash("sha256")
      .update(
        JSON.stringify({ b: m.state, o: m.objectiveMatch, n: m.national }),
      )
      .digest("hex"),
  };
}
const runs = [];
for (const [roles, fullClock] of repeatedRecovery
  ? [
      [permutations[0], false],
      [permutations[0], true],
    ]
  : gateOnly
    ? permutations.map((p) => [p, false])
    : [
        ...permutations.map((p) => [p, false]),
        [permutations[0], true],
        [permutations[5], true],
      ]) {
  const a = run(roles, fullClock, gateOnly),
    b = run(roles, fullClock, gateOnly);
  assert.equal(a.hash, b.hash);
  runs.push(a);
  process.stderr.write(
    `verified ${runs.length}/${repeatedRecovery ? 2 : gateOnly ? 6 : 8} roles${roles.join("/")} fullClock${fullClock} tick${a.tick} winner${a.result.winner}\n`,
  );
}
const baseline = JSON.parse(
  readFileSync(
    new URL(
      "../../../docs/demo/phase7-policy-v1-results.json",
      import.meta.url,
    ),
  ),
);
const distance = (a, b) => Math.round(Math.hypot(a.x - b.x, a.y - b.y));
console.log(
  JSON.stringify(
    {
      profile: repeatedRecovery
        ? "phase7-v1 offline repeated manual recovery requests; seed41"
        : gateOnly
          ? "phase7-v1 offline opening-gate candidate; seed41"
          : "phase7-v1 offline role ablation; seed41",
      rules,
      limitations:
        "Fixed map and entity labels. Six permutations isolate only macro role allocation; fixed fallback order, formation orientation and integer movement remain. Two full-clock cases defer unification offline only. With --gate-only, movement to a closed target is withheld, without changing player inputs in production. Automated actors never choose skills, augments, formations or strategic retreat. No human growth or fairness acceptance.",
      baselineSummary: baseline.summary,
      distances: nations.map((n) => {
        const base = rules.objectives.points.find(
          (p) => p.id === rules.bases[n],
        );
        return {
          nation: n,
          toPoints: Object.fromEntries(
            rules.objectives.points
              .filter((p) => p.score > 0)
              .map((p) => [p.id, distance(base.position, p.position)]),
          ),
        };
      }),
      recoveryPolicy: repeatedRecovery
        ? "scripted request every100ticks when wiped and affordable"
        : "one scripted request per actor",
      replayed: runs.length,
      summary: {
        normalWins: Object.fromEntries(
          [...nations, null].map((n) => [
            String(n),
            runs.filter((r) => !r.fullClock && r.result.winner === n).length,
          ]),
        ),
        fullClockLevels: runs
          .filter((r) => r.fullClock)
          .map((r) => ({
            roles: r.roles,
            tick: r.tick,
            levels: r.players.map((p) => p.level),
            earned: r.players.map((p) => p.earned),
          })),
      },
      runs,
    },
    null,
    2,
  ),
);
