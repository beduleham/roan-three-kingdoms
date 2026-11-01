import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import assert from "node:assert/strict";
import { AuthoritativeMatch, nationalSlots } from "../dist/match.js";
import { snapshotNationalMetrics } from "../dist/national-audit.js";
const normal = JSON.parse(
  readFileSync(
    new URL("../../../national_demo.v1.json", import.meta.url),
    "utf8",
  ),
);
const countries = ["blue", "red", "green"];
const assignments = [
  ["blue", "red", "green"],
  ["blue", "green", "red"],
  ["red", "blue", "green"],
  ["red", "green", "blue"],
  ["green", "blue", "red"],
  ["green", "red", "blue"],
];
const seeds = [1, 41];
function run(assignment, seed) {
  const rules = structuredClone(normal),
    origins = countries.map(
      (n) =>
        normal.objectives.points.find((p) => p.id === normal.bases[n]).position,
    );
  for (const [i, n] of countries.entries())
    rules.objectives.points.find((p) => p.id === rules.bases[n]).position =
      structuredClone(origins[countries.indexOf(assignment[i])]);
  const m = new AuthoritativeMatch("national", undefined, rules, seed);
  nationalSlots.forEach((s, i) => m.join(String(i)));
  m.start("0");
  const attempts = new Set();
  while (m.ready) {
    if (m.state.tick % rules.aiEveryTicks === 0)
      for (const [i, seat] of nationalSlots.entries()) {
        const cmd = m.nationalAICommand(seat);
        if (cmd) m.submit(String(i), cmd);
        else if (
          !attempts.has(seat) &&
          !m.state.squads.some((s) => s.ownerPlayerId === seat && s.hpMilli > 0)
        ) {
          const p = m.state.players.find((p) => p.id === seat);
          if (p.supplyPoints >= rules.recruitCost) {
            attempts.add(seat);
            m.submit(String(i), {
              type: "RECRUIT",
              unitType: "spears",
              squadIds: [],
            });
          }
        }
      }
    m.advance();
    assert(m.state.tick <= rules.checkpoints[2]);
  }
  const players = snapshotNationalMetrics(m.state, m.national);
  for (const p of players) {
    assert(p.squads <= p.squadCap);
    assert(p.soldiers <= p.soldierCap);
  }
  assert.equal(m.national.ranking.length, 9);
  assert.equal(m.national.jobs.length, 0);
  const hash = createHash("sha256")
    .update(
      JSON.stringify({
        state: m.state,
        objectives: m.objectiveMatch,
        progress: m.national,
      }),
    )
    .digest("hex");
  return {
    assignment,
    seed,
    tick: m.state.tick,
    result: m.objectiveMatch.result,
    players,
    recoveryAttempts: [...attempts],
    hash,
  };
}
const runs = [];
for (const assignment of assignments)
  for (const seed of seeds) {
    const a = run(assignment, seed),
      b = run(assignment, seed);
    assert.equal(a.hash, b.hash);
    runs.push(a);
    process.stderr.write(
      `verified ${runs.length}/12 ${assignment.join("/")} seed${seed} tick${a.tick} ${a.result.winner}\n`,
    );
  }
console.log(
  JSON.stringify(
    {
      profile: "phase7-v1 final production rules; existing AI macro routing",
      rules: normal,
      seeds,
      assignments,
      controls:
        "basic commands; one scripted manual recovery attempt per defeated actor; no auto skills/augments/retreat/formations; automated actors are not human playtesters",
      replayed: 12,
      summary: {
        winsByNation: Object.fromEntries(
          countries.map((n) => [
            n,
            runs.filter((r) => r.result.winner === n).length,
          ]),
        ),
        winsByPhysicalOrigin: Object.fromEntries(
          countries.map((n) => [
            n,
            runs.filter(
              (r) =>
                r.result.winner &&
                r.assignment[countries.indexOf(r.result.winner)] === n,
            ).length,
          ]),
        ),
        draws: runs.filter((r) => !r.result.winner).length,
      },
      runs,
    },
    null,
    2,
  ),
);
