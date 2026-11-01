> 2026-11-01 후속 결정: 사용자는 실제 인간 위치/역할 교대·성장 분포·증강 효용·지원/방어 평가를 보류하고 Phase8 개발 진입을 요청했다. 아래 실행 근거는 보존하며 미검증 항목을 통과로 바꾸지 않는다. [Phase8 작업](../network/PHASE8_GAME_SCREEN.md).

# Phase 7 — implementation and acceptance boundary (2026-11-01 Korea)

## What is ready

The approved Phase7 v1 rules are implemented and deployed. An HTTPS/WSS smoke against Render after the user's manual deployment confirmed `phase7-v1`, three countries in one private room, ignored client rule/seed overrides, foreign refill denial, growth spoof rejection, identical public final state/ranking, frozen tick and post-finish command rejection. This was a short isolated room, not a full human match or competitive balance certification.

The client now offers **내 경기 기록 저장 (JSON)** with optional role/decision notes. This new export UI requires the next manual deploy. It records self XP/level/merit/supply/living army every300ticks (30 simulation seconds), observed offer/selection/job/empty-army transitions, submitted command types, admission replies and public final objectives/ranking. Candidate IDs and geometric public rules are snapshotted; account identity, invitation key, reconnection token, enemy sightings and other players' private progression are not copied. Lists are bounded with dropped-record counts. The export stays local until a user saves/shares it.

Observation times are actual received ticks. Gaps are not filled with invented checkpoint values. Page refresh resets this in-memory record and a late join starts late; coverage records this. Command admission is not proof of successful execution. It is not a replay, authoritative telemetry, proof of human participation, actual support-impact attribution or an automatic fun score. Short-clock/browser fixtures must never be pooled with full production games; policyVersion alone is not build identity, so record the deployed commit with the test notes.

## Position and role interventions

[Role raw data](phase7-role-audit-results.json): six permutations of nation-to-macro-role indices on a fixed map/entity assignment, seed41, each replayed with an identical final SHA256. Normal clock produced **NW4 / NE2 / south0**. Two additional cases deferred unification past21minutes offline to observe15-minute progression; each also replayed identically. These change only role assignment or the finish clock, never production defaults.

The previous spawn-permutation series already mixed physical starts with fixed nation roles. Holding starts fixed while permuting roles shows that role allocation alone does not remove the bias. It does not isolate map geometry from fixed fallback order, unrotated spawn formations, movement rounding, identity/tie rules or policy interactions. Six cases with a single seed are controlled deterministic cases, not independent statistical estimates of player win probability.

At the original role assignment, first wipes occur at ticks208/254/303 for the three southern actors, before the first field opening at1200. Initial nearest field distances are5000/5000/3000units (NW/NE/south); distance alone cannot explain the disadvantage. The basic scripted movement makes closed objectives pre-opening battle destinations; it is an observed mechanism, not proof of the sole cause.

[Opening-gate candidate data](phase7-opening-gate-results.json): withholding scripted movement to closed preferred objectives, six role permutations plus six exact replays. Result remains **NW4 / NE2 / south0**; this candidate is **not adopted**. No production map, opening schedule or macro AI change is included.

In the two15-minute clock interventions the NW actors finish at levels35/33/34 and35/31/34; south5–6, NE10–16. NW earned opportunities5–6 while defeated actors earned1–3. Actors submit basic movement and one paid recovery request each, never skills, augment choices, formation changes or strategic retreats. These are survival/territory-contingent automated observations, not the target human33–35 distribution. Earned opportunities are not actual choices. The clock intervention must not be described as a normally completed production game.

## Recovery-policy counterexample

[Repeated recovery raw data](phase7-repeated-recovery-results.json): same production map/seed41/original macro roles, but the scripted actor requests paid recovery every100ticks when wiped and affordable instead of stopping after one attempt. The ordinary production clock finishes at **tick10800 (18minutes), green177 / red156 / blue135**, green wins. A second case deferring unification has the same ending; both cases replay exactly. These are two clock variants of the same behavior/outcome, not two independent strategies or independent wins.

At15minutes the9 actors are levels38/35/27,30/28/26,32/27/23 (NW/south/NE respectively). At18minutes they span26–40. There are121 recovery _requests/admission replies_ in each run; admission is not evidence that121 jobs completed. No runtime auto-recovery, free soldiers, AI skill/augment selection or economic change was added. A regression verifies repeated manual recovery needs real accumulated supply, debits twice and never resurrects old IDs.

This is a counterexample to “south cannot win” and shows the original one-recovery harness materially constrained the result. **Do not infer a production map defect or human win probability solely from the south0 scenarios, and do not fix that statistic by blindly changing the map.** Fairness still needs strategy diversity and real players. Keep the negative one-recovery cases and the counterexample together.

## Acceptance status

| Gate                                                             | Evidence/status                                                                                                                |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Approved v1 contracts, authority, growth/paid recovery mechanics | Implemented; automated regression passed                                                                                       |
| Current v1 public deployment                                     | Short Render SDK smoke passed                                                                                                  |
| New export and its data boundaries                               | Unit tests and real Chromium download/JSON assertions passed; new public UI deployment pending                                 |
| Position fairness                                                | Unaccepted: one-recovery cases retain south0, but repeated recovery gives south an18-minute win; outcome is behavior-sensitive |
| Human15-minute level33–35 /5–6 useful augment choices            | No human sample collected; not accepted                                                                                        |
| Augment eligibility/trigger/expiry/stacking                      | Contract tests exist; comparative human usefulness unmeasured                                                                  |
| Support/defense ranking fairness                                 | Real field defense shares hold rewards; arbitrary support weights not introduced; outcome normalization unaccepted             |
| Strategic decision density and low unnecessary APM               | Requires real participant decisions/feedback; unmeasured                                                                       |
| Phase8                                                           | Entered by user direction; human balance checks deferred, not passed                                                           |

Do not turn failed/absent evidence into checked completion. Phase7 engineering and automated diagnosis can be prepared here; final balance acceptance requires broader strategy/position evidence and actual playtests. The experimental labels remain.

## Next concrete evidence

Use the [playtest procedure](../network/PHASE7_PLAYTEST.md) with at least one real participant per nation. Rotate who joins first/second/third between games to swap NW/NE/south, hold strategies fixed for comparisons, then rotate roles as a separate comparison. Record meaningful choice reasons rather than using raw click counts as a proxy. Collect each participant's JSON before refresh/closing the tab and label build/role/game. A three-game rotation is an initial diagnostic block, not sufficient by itself to certify win-rate fairness.

Production changes to map geometry, role routing, opening schedule or support weights need a concrete revised proposal and comparative evidence. The failed gating experiment is not a reason to silently adopt it. Do not force balanced win counts by shuffling nation labels.

## Reproduce

```
npm test
npm run typecheck
npm run build
npm run sim:roles > role-audit.json
node apps/server/test-support/phase7-role-audit.mjs --gate-only > opening-gate.json
node apps/server/test-support/phase7-role-audit.mjs --repeated-recovery > repeated-recovery.json
```

The new checks passed452 unit/contract cases in37 files, TypeScript, production build, formatting and30 real Chromium regressions (national3, online15, maps4, objectives4, network4). National coverage includes downloading and parsing a final JSON with choice/notes/result, without invitation/reconnection fields. The16 offline conditions each replayed with matching hashes; clock variants are not independent human samples.

For the remote production policy smoke: `DEMO_URL=https://roan-three-kingdoms.onrender.com npm run test:policy:public`.
