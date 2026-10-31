// Deterministic automated actors use basic movement/attacks only; never select skills or augments.
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import assert from "node:assert/strict";
import {
  AuthoritativeMatch,
  initialNationalBattle,
  nationalSlots,
} from "../dist/match.js";
const normal = JSON.parse(
  readFileSync(
    new URL("../../../national_demo.v1.json", import.meta.url),
    "utf8",
  ),
);
const count = Number(process.argv[2] ?? 10),
  full = process.argv.includes("--full");
if (!Number.isInteger(count) || count < (full ? 1 : 10) || count > 100)
  throw Error("run count must be 10..100 (full clock also allows 1)");
const rules = full
  ? normal
  : {
      ...normal,
      checkpoints: [900, 1080, 1260],
      unifyAfterTick: 600,
      unifyHoldTicks: 45,
      objectives: {
        ...normal.objectives,
        captureTicks: 3,
        limitTicks: 1260,
        points: normal.objectives.points.map((p) => ({
          ...p,
          opensAtTick: Math.floor(p.opensAtTick / 10),
        })),
      },
    };
function run(seed) {
  const m = new AuthoritativeMatch("national", undefined, rules);
  m.state = initialNationalBattle(rules, seed); // Trusted offline fixture. Not reachable from room options.
  nationalSlots.forEach((s, i) => m.join(`sim${i}`));
  m.start("sim0");
  while (m.ready) {
    if (m.state.tick % rules.aiEveryTicks === 0)
      nationalSlots.forEach((s, i) => {
        const command = m.nationalAICommand(s);
        if (command) m.submit(`sim${i}`, command);
      });
    m.advance();
  }
  assert(m.objectiveMatch.result);
  assert.equal(m.national.ranking.length, 9);
  for (const p of m.state.players) {
    const squads = m.state.squads.filter(
        (s) => s.ownerPlayerId === p.id && s.hpMilli > 0,
      ),
      cap = m.state.config.rankCaps[p.rank];
    assert(squads.length <= cap.squads);
    assert(
      squads.reduce(
        (n, s) =>
          n +
          Math.ceil(
            s.hpMilli /
              (m.state.config.soldierHp * m.state.config.hpMilliPerHp),
          ),
        0,
      ) <= cap.soldiers,
    );
  }
  const hash = createHash("sha256")
    .update(JSON.stringify({ b: m.state, o: m.objectiveMatch, n: m.national }))
    .digest("hex");
  return { seed, tick: m.state.tick, result: m.objectiveMatch.result, hash };
}
const results = [];
for (let i = 0; i < count; i++) {
  const first = run(41 + i),
    replay = run(41 + i);
  assert.equal(replay.hash, first.hash);
  results.push(first);
}
console.log(
  JSON.stringify(
    {
      profile: full
        ? "national_demo.v1 (full clock)"
        : "accelerated test clock (1/10 open/deadline/unification, 3-tick capture)",
      runs: count,
      replays: count,
      deterministic: true,
      results,
    },
    null,
    2,
  ),
);
