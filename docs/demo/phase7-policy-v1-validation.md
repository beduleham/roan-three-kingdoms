# Phase7 rule baseline v1 — fresh recovery validation, 2026-11-01 Korea

## Evidence boundary

Workspace maintenance removed the preceding uncommitted files and local logs. Source was restored from GitHub main `e452cc28f2e45bc9f623d6eb4f366a4e1041bee8`; restored text/art assets were checked against their Git blob hashes. Previously committed reports remain historical evidence. Uncommitted run counts/logs from the lost workspace are **not** claimed as evidence here. The checks below were rerun after restoration.

## Implemented

The approved proposal is connected to the production national path: no passive home XP/merit, promoted per-squad capacity without free HP, paid manual wiped recovery at an owned home, completion/finish refunds, proportional effective HP credit with stable core event identities, nine distinct augment definitions and seeded choices. Existing AI macro routing and map/timing/combat values remain unchanged; exact automatic target ties use deterministic seeds. Legacy profiles/offer ordering remain available for regression tests. Dead squads disappear from selection/drawing; recovery reenables commands and supports commander reassignment.

The new policy/reference boundaries are [documented here](../network/PHASE7_POLICY_v1.md). No support-event-count score weights, formal map-fairness claim, actual human level-distribution claim, Google login or Phase8 changes are included.

## Fresh checks

- `npm test`:446 passed across36 files (428 preserved tests +16 national-policy cases +2 seeded target cases). Capacity/payment, wiped recovery/refunds, no resurrection, command authority, damage conservation/order/dedup/stale/friendly/tick boundaries, real field defense, unique9/seeded offers/7choices/R gating, commander protection ratios and production reward-ledger calibration covered.
- Production build and TypeScript passed. Real restored assets were used; no placeholder art. Existing Vite bundle-size/third-party annotation warnings remain.
- Prettier passed after whitespace normalization of two existing reports; their meaning was preserved.
- Chromium national3 + online15 + maps4 + objectives4 + latency/reservation4 =30 passed. Nine independent clients include a trusted test-only wiped blue-3 fixture: controls disabled while empty → paid new squad → controls restored → manual commander reassignment → reconnect/abandon/same allied hashes/full ranking. The accelerated fixture deliberately enables home rewards to drive growth quickly; production home suppression is covered by the isolated normal-policy test. Clients cannot request this fixture.
- SDK smoke against the normal production entry on localhost passed: private3-country room, policy version, ignored client rule override, hidden seed/enemy progression, foreign refill/growth spoof refusal, identical abandonment results/ranking, frozen tick and post-finish command rejection. This is **local production-path** evidence, not public Render acceptance of the new policy.

## Repeated normal-clock games

`node apps/server/test-support/policy-validation.mjs`:6 base assignments × seeds1/41 =12 games, each replayed once. All authoritative SHA-256 hashes matched. All ended at tick6449 by unification, with9 actor rankings, no outstanding jobs, and final soldier/squad caps respected; core invariants also execute during each tick.

[Machine results](phase7-policy-v1-results.json) record the exact profile, assignments, seeds, final metrics, recovery attempts and hashes. Automated actors send basic commands and at most one scripted paid recovery request each. They do not auto-select skills, augments, formations or strategic retreat. These are not human playtesters or independent samples of human strategy.

Nation labels won4/4/4, but physical origins won **NW8 / NE4 / south0**. Because fixed AI roles and spawns interact, this does not isolate a geometry-only cause. It does show the current position/role combination has not passed fairness acceptance. Final actor levels ranged4–31 at10:44.9; these early, basic-action games do not measure the target15-minute human distribution.

Reference XP3520/3780/4120 maps to33/34/35, and4800/5600 to38/40. One defender ledger was processed through the actual progression function. These are assumed activity budgets, not measured human quantiles; passive home presence yields no XP.

## Reproduce and rollout

```
npm ci
npm run build
npm test
npm run typecheck
npm run format:check
npm run sim:policy > policy-results.json
```

Use `DEMO_CHROMIUM_PATH` if a system Chromium is required. The fresh run used an official Chrome-for-Testing headless shell after the Playwright-pinned browser download failed; the executable and real browser checks succeeded.

After manual Render deployment, run `DEMO_URL=https://roan-three-kingdoms.onrender.com npm run test:policy:public` for a short production-profile/network smoke, then follow the [human playtest form](../network/PHASE7_PLAYTEST.md) with active field play and role/position swaps. The old standing-home long-run harness is legacy-only because home idling no longer grants growth.

New policy public acceptance is pending deployment. Policy implementation/automatic contracts are complete; competitive balance acceptance remains open for start-position fairness, actual human growth distribution, augment utility and support contribution normalization. No Phase8 entry is claimed.
