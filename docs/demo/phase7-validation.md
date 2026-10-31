# Phase 6 external completion / Phase 7 validation — 2026-11-01 Korea

## Public Phase6 acceptance

Three independent Chromium guest contexts joined one private `battle_national` room on public Render. Normal production clock/rules, no client overrides. The harness stayed near homes, selected a real5-level augment, earned rank, paid for a new blue squad, and refilled it. The other six seats used the production basic AI. These are automated browser actors, not three human playtesters.

At tick9000 (15min), all three displayed **red wins, blue0/red152/green0** and the same all-human ranking: blue-1 merit5703/Lv12, red-1 merit5400/Lv12, green-1 merit997/Lv4. National victory and individual ranking are independent. Controls and tick froze after the final snapshot. Same room during map switching, seven objectives, actual timed growth, rank/recruit/refill/augment and final agreement passed; no pageerror events. Machine evidence: [public journal](phase6-public-national.json).

Proxy certificate verification was bypassed only in Chromium test contexts for the sandbox HTTPS proxy. This is not a production TLS-chain validation claim. An initial join assertion with a5-second timeout was retried with30 seconds; the subsequent full run completed.

The public run exposed a UI issue: at a15-minute finish the maximum21-minute clock still showed360 seconds remaining. This change fixes the client to use the current checkpoint and show0 after any finish. Core result/clock was already correct. This visual fix and new dynamic augment descriptions await the next manual Render deployment; the public journal intentionally preserves the old erroneous countdown as evidence.

## Phase7 implementation

- `national-audit.ts`: read-only effective damage/contribution/XP/merit/supply/rank/cap metrics, one-point idle-growth calculations, reachable troop capacity while retaining original squads, duplicate-mechanics audit. Never imported by production room/index.
- `phase7-balance.mjs`: full-clock factorial start-position/policy runs, matched replay hashes, checkpoints and final player metrics. `--growth-only` defers unification beyond21min solely to observe15min growth. `--layout-candidate` loads separate rotational map/formation/routing data. Production modes never import experiment data.
- Nine distinct skill/trigger/target/effect prototype definitions; no production enablement. Seven valid choices, R eligibility, each trigger/mismatch/expiry verified. Existing effect numbers are borrowed hypotheses, not balance-approved content.
- Offline proportional effective-damage attribution proposal: integer/BigInt shares, stable remainder, per-target HP budget, claim identity duplicate/conflict handling and order invariance. Actual engine event identity integration remains pending; the production award rule is unchanged.
- Client augment labels use projected definitions for actual effect percentage/duration. Optional metadata retains compatibility with an older server. Snapshot metadata is cloned and only available within the existing allied projection.
- Current checkpoint/finished countdown corrected without changing any battle/scoring/timing rules.

## Experiment results

| Test axis                                                                                            | Games + matched replays | Finding                                                                                                                                                           |
| ---------------------------------------------------------------------------------------------------- | ----------------------: | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Existing geometry,6 base permutations ×2 basic policies ×2 seeds                                     |                   24+24 | Production AI: physical NW8 / NE4 / south0 wins. Alternative nearest-role: NW0 / NE12 / south0. Each policy's nation names split4/4/4, which hides physical bias. |
| 15min growth, unification deferred in offline fixture                                                |                     2+2 | Both policies ended at9000; player levels together1–13, median3. Normal-human target33–35 is unproven and clearly not reached by these basic actors.              |
| Approximate rotational geometry + rotated initial formations + clockwise role routing,6 permutations |                     6+6 | Physical top0 / SW3 / SE3 wins. Still biased; candidate rejected as a production default. Several axes changed together, so no single-cause claim.                |

**Total32 cases +32 matched replays.** All terminate, produce nine actor rankings, stay within final active troop/squad caps and have matching authoritative hashes. Ordinary full-clock cases end at6449 by unification; growth-only cases at9000 by time. Per-tick core invariants also execute during simulation. Basic movement/attacks only: no autonomous Q/W/R, formations, strategic retreat, augment selection or supply tactics. Runs are controlled fixtures, not independent human strategy samples or statistical balance proof. Seeds41/42 do not randomize the sorted augment offers, and paired outputs do not provide extra strategy diversity.

Full data: [factorial](phase7-balance-results.json), [15min growth](phase7-growth-results.json), [layout candidate](phase7-layout-results.json).

Additional deterministic findings:

- One uncontested home throughout15min grants XP3600/Lv12, merit5400, supply410;21min grants Lv15. This model was checked against the real progression function in a stationary fixture. It is a baseline, not a claim about all human playstyles.
- Keeping both starting max20 squads yields troop capacity40/40/60/65/90 at ranks capped40/50/60/75/90. New max25 squads can eventually fill the overall4/90 cap. Replacing defeated originals is outside this calculation.
- Catalog9 IDs represent3 mechanics. Offers are lexically sorted eligible IDs, not a seeded draw. The prior Phase6 report's seeded-offer explanation was corrected.
- A player with every squad defeated cannot currently recruit, even with enough supply and an owned home, because recruitment requires an eligible own squad on site. An isolated reproduction test records this recovery-policy boundary.
- Effective HP credit conserves the total but currently favors earlier attack events under overkill. Proposed proportional allocation fixes this in isolated tests, pending policy approval and stable engine event identity integration.

## Checks

- `npm test`:428 passed in34 files (Phase6 baseline401;23 audit/description cases plus4 countdown cases). Includes real formula comparison, existing order-dependence reproductions, all proposed augment effects and damage attribution invariants.
- Production build, TypeScript and Prettier checks passed. Existing Vite size/third-party annotation warnings remain.
- National Chromium3 passed:3-browser supply/growth/augment/recruit/overtime/result;9-browser reconnect/abandon/identical allied hashes and all-human ranking; network authority and private growth. Dynamic descriptions and zero post-finish countdown asserted.
- Existing maps4 + objectives4 + online15 passed. Browser total26. The four latency/reservation cases were previously passed in Phase6 and were not rerun for this read-only audit/presentation change.
- Public15min browser completion above is an additional deployed-build acceptance; the two new client presentation fixes await manual deployment.

## Reproduce

```
npm run build
npm test
node apps/server/test-support/phase7-balance.mjs > factorial.json
node apps/server/test-support/phase7-balance.mjs --growth-only > growth.json
node apps/server/test-support/phase7-balance.mjs --layout-candidate > layout.json
```

Each JSON records design axes, clocks/layout variant, individual metrics, outcome and final hash; progress goes to stderr. They run offline without deploying changes. Public acceptance can be explicitly invoked with `npm run test:national:public` and `DEMO_URL`; optional `DEMO_CHROMIUM_PATH`, `DEMO_BROWSER_PROXY`, `DEMO_REPORT_DIR` configure the test environment. Certificate bypass requires explicit `DEMO_TEST_PROXY_TLS=1` and is recorded. It creates an isolated private guest room and may take22.5min; production hosts require HTTPS.

## Remaining decisions

[Concrete proposals](../network/PHASE7_BALANCE_PROPOSAL.md) and the [human playtest form](../network/PHASE7_PLAYTEST.md) cover map fairness, home rewards/XP curve, per-squad capacity, effective damage credit, support/defense normalization, and formal augment roster/selection/stacking. None is silently enabled. Human strategic density, target level distribution, diverse supply/skill use, and competitive fairness still require human evidence and policy decisions. Phase8 has not begun; Google login remains deferred.
