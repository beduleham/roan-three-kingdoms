// Offline factorial design audit. No production room can load these variants.
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import assert from "node:assert/strict";
import {
  AuthoritativeMatch,
  initialNationalBattle,
  nationalSlots,
} from "../dist/match.js";
import {
  auditNationalEconomy,
  auditAugmentCatalog,
  snapshotNationalMetrics,
} from "../dist/national-audit.js";
const normal = JSON.parse(
  readFileSync(
    new URL(
      "../../../experiments/phase7/legacy-national.v1.json",
      import.meta.url,
    ),
    "utf8",
  ),
);
const design = JSON.parse(
  readFileSync(
    new URL("../../../experiments/phase7/scenarios.json", import.meta.url),
    "utf8",
  ),
);
const nations = ["blue", "red", "green"];
const growthOnly = process.argv.includes("--growth-only");
const layoutCandidate = process.argv.includes("--layout-candidate");
const layout = layoutCandidate
  ? JSON.parse(
      readFileSync(
        new URL(
          "../../../experiments/phase7/layout-candidate.v1.json",
          import.meta.url,
        ),
        "utf8",
      ),
    )
  : null;
function trial(assignment, policy, seed) {
  const rules = structuredClone(normal);
  if (growthOnly) rules.unifyAfterTick = design.growthAuditUnifyAfterTick;
  if (layout)
    for (const point of rules.objectives.points)
      point.position = structuredClone(layout.positions[point.id]);
  const basePositions = nations.map(
    (n) =>
      rules.objectives.points.find((p) => p.id === rules.bases[n]).position,
  );
  nations.forEach((n, i) => {
    rules.objectives.points.find((p) => p.id === rules.bases[n]).position =
      structuredClone(basePositions[nations.indexOf(assignment[i])]);
  });
  const m = new AuthoritativeMatch("national", undefined, rules);
  m.state = initialNationalBattle(rules, seed);
  if (layout)
    for (const squad of m.state.squads) {
      const nation = squad.nationId,
        physical = assignment[nations.indexOf(nation)],
        vectors = layout.formations[physical];
      const origin = rules.objectives.points.find(
        (p) => p.id === rules.bases[nation],
      ).position;
      const slot = Number(squad.ownerPlayerId.at(-1)) - 2,
        unit = Number(squad.id.at(-1)) - 1;
      squad.position = {
        x:
          origin.x +
          Math.round(
            ((slot * vectors.tangent.x + unit * vectors.inward.x) *
              layout.offsetUnits) /
              layout.basis,
          ),
        y:
          origin.y +
          Math.round(
            ((slot * vectors.tangent.y + unit * vectors.inward.y) *
              layout.offsetUnits) /
              layout.basis,
          ),
      };
    }
  nationalSlots.forEach((s, i) => m.join(`test${i}`));
  m.start("test0");
  const samples = [
    { tick: 0, players: snapshotNationalMetrics(m.state, m.national) },
  ];
  const distance = (a, b) => (a.x - b.x) ** 2 + (a.y - b.y) ** 2;
  function orders(seat) {
    if (policy === "production") return m.nationalAICommand(seat);
    const nation = seat.split("-")[0],
      slot = Number(seat.at(-1)) - 1,
      base = rules.objectives.points.find(
        (p) => p.id === rules.bases[nation],
      ).position;
    const outer = m.objectiveMatch.points
      .filter((p) => p.id.startsWith("outer-"))
      .sort(
        (a, b) =>
          distance(a.position, base) - distance(b.position, base) ||
          (a.id < b.id ? -1 : 1),
      );
    const capital = m.objectiveMatch.points.find((p) => p.id === "capital");
    const angular = layout
      ? [...outer].sort(
          (a, b) =>
            Math.atan2(
              a.position.y - capital.position.y,
              a.position.x - capital.position.x,
            ) -
            Math.atan2(
              b.position.y - capital.position.y,
              b.position.x - capital.position.x,
            ),
        )
      : [];
    const next = layout
      ? angular[(angular.indexOf(outer[0]) + 1) % 3]
      : outer[1];
    const targets = [outer[0], capital, next],
      preferred = targets[slot];
    const target =
      preferred.owner === nation
        ? ([...outer, capital]
            .filter((p) => p.open && p.owner !== nation)
            .sort(
              (a, b) =>
                distance(a.position, base) - distance(b.position, base) ||
                (a.id < b.id ? -1 : 1),
            )[0] ?? preferred)
        : preferred;
    const squadIds = m.state.squads
      .filter((s) => s.ownerPlayerId === seat && s.hpMilli > 0)
      .map((s) => s.id);
    return squadIds.length
      ? { type: "ATTACK_MOVE", squadIds, destination: { ...target.position } }
      : null;
  }
  while (m.ready) {
    if (m.state.tick % rules.aiEveryTicks === 0)
      nationalSlots.forEach((s, i) => {
        const command = orders(s);
        if (command) m.submit(`test${i}`, command);
      });
    m.advance();
    if (design.sampleTicks.includes(m.state.tick))
      samples.push({
        tick: m.state.tick,
        players: snapshotNationalMetrics(m.state, m.national),
      });
  }
  const final = snapshotNationalMetrics(m.state, m.national);
  assert(m.objectiveMatch.result);
  assert.equal(m.national.ranking.length, 9);
  for (const p of final) {
    assert(p.squads <= p.squadCap);
    assert(p.soldiers <= p.soldierCap);
  }
  const hash = createHash("sha256")
    .update(JSON.stringify({ b: m.state, o: m.objectiveMatch, n: m.national }))
    .digest("hex");
  const early =
    samples.at(-1)?.tick === m.state.tick
      ? []
      : [{ tick: m.state.tick, players: final }];
  return {
    assignment,
    policy,
    seed,
    tick: m.state.tick,
    result: m.objectiveMatch.result,
    hash,
    samples: [...samples, ...early],
    final,
  };
}
assert(
  !(growthOnly && layoutCandidate),
  "Choose one experiment axis per invocation",
);
const initial = initialNationalBattle(normal),
  report = {
    design,
    clockVariant: growthOnly
      ? "unification deferred beyond21min (offline only)"
      : "production clock",
    layoutVariant: layout
      ? "rotational candidate + rotated formations + clockwise role routing (offline only)"
      : "production layout",
    economy: auditNationalEconomy(initial, normal),
    augments: auditAugmentCatalog(initial),
    runs: [],
    summary: {},
  };
for (const assignment of growthOnly ? [nations] : design.assignments)
  for (const policy of layoutCandidate ? ["nearest-role"] : design.policies)
    for (const seed of growthOnly || layoutCandidate
      ? [design.growthAuditSeed]
      : design.seeds) {
      const result = trial(assignment, policy, seed),
        replay = trial(assignment, policy, seed);
      assert.equal(result.hash, replay.hash);
      report.runs.push(result);
      process.stderr.write(
        `verified ${report.runs.length}/${growthOnly ? 2 : layoutCandidate ? 6 : 24}: ${assignment.join("/")} ${policy} seed${seed} tick${result.tick} ${result.result.winner}\n`,
      );
    }
for (const policy of design.policies) {
  const runs = report.runs.filter((r) => r.policy === policy);
  report.summary[policy] = {
    games: runs.length,
    winners: Object.fromEntries(
      [...nations, null].map((n) => [
        String(n),
        runs.filter((r) => r.result.winner === n).length,
      ]),
    ),
    winnerByPhysicalStart: Object.fromEntries(
      nations.map((n) => [
        n,
        runs.filter(
          (r) =>
            r.result.winner &&
            r.assignment[nations.indexOf(r.result.winner)] === n,
        ).length,
      ]),
    ),
    durationTicks: runs.map((r) => r.tick),
    levels: runs.flatMap((r) => r.final.map((p) => p.level)),
  };
}
console.log(JSON.stringify(report, null, 2));
