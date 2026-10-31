# Phase 6 tasks 6–11 — validation

## Implemented scope

Server-authoritative opt-in `battle_national`: three nations, nine seats (minimum three humans, one per nation; AI fills remaining seats), seven points, paid refill/new squads, independent XP/merit/rank/caps, human augment choices, overtime/unification, final ranking of all humans regardless of nation victory. Existing demo modes remain separate. Rules and limitations: [national mode](../network/NATIONAL_MATCH_v0.1.md); [open decisions](../network/NATIONAL_OPEN_DECISIONS.md).

## Automated evidence

- `npm test`: 401 passed, 31 files. Nineteen new national cases cover nine-seat initialization/late admission, supply payment/completion/refund/dead/forced/enemy/full targets, any own eligible squad at a point, rank capacity on request and completion, paid recruits/4-squad ceiling, effective HP damage without overkill or duplicate ticks, separate XP/merit, seven human augment selections, exact 15/18/21-minute boundary gaps/ties, interrupted unification hold, all-human rankings, allied projection cloning/privacy, spoof rejection, pause/resume/abandon.
- `npm run typecheck`: passed. Production core/protocol/server/client build passed. Existing Vite size/third-party annotation warnings remain.
- Real Chromium national acceptance: 3 passed. Three independent browsers exercised supply → growth → augment choice → new squad → both overtime phases → matching odd-tick final result and ranking. Nine independent browsers joined all seats, reconnected green to the same seat, then verified abandonment, identical public results/rankings for all remaining peers, nine-human ranking, and identical allied tick/state hashes. SDK clients verified rule overrides ignored, foreign refill rejected, growth spoof rejected, and enemy progress omitted.
- Production Chromium visual review: three-country lobby, seven objectives, growth/supply/augment sections, overview/battle map, nation colors, unit labels and command controls inspected.
- Existing Chromium regressions: maps4, objectives4, online15, network4 passed (27). This includes camera-only state, capture, fog/last sightings, final state freeze/reload/new match, 1v1/3v3/invites/authority, latency/jitter/temporary loss and actual30-second reservation expiry. Total browser/network cases:30.
- Test-only national entry uses accelerated deadlines100/130/161 ticks, growth awards, two-tick jobs and injured units. Production entry never imports it and clients cannot request it. This verifies UI flow, not production time/balance.

## Repeated deterministic matches

Commands after build:

```
node apps/server/test-support/national-repeat.mjs 10
node apps/server/test-support/national-repeat.mjs 1 --full
```

Ten seeded games41–50 were each run twice, comparing SHA-256 of final authoritative combat/objective/progression state; all replay hashes matched and final human rankings included nine actors. The accelerated profile divides opening/deadline/unification clocks by10 and uses capture3 ticks, while combat speed/damage remains unchanged. Every game ended at tick1080 with blue42/red35/green0. This is ten reproducible inputs, **not ten independent strategy samples**: seeds affect augment offers, but basic movement/attack policy is the same and selects no augments/skills.

One additional full production-clock game (seed41) and its replay both ended at tick6449 by blue unification, blue433/red4/green0; hash `83c848439f2dbc717467c480d5459c75a4e1c6ce010c2c1482f98fdd1112b67c`. All runs checked termination, nine-human ranking and active squad/soldier caps. Full machine-readable results are beside this report.

These runs expose strong blue/green outcome bias in the provisional layout/basic policy. They prove determinism and functional completion, not competitive balance, human decision quality, desired XP distribution, support/defense merit fairness or gameplay quality. No balance values were silently changed to make the report appear even. AI does not auto-select Q/W/R/retreat/formation/augments; automated humans in this offline fixture also use basic movement/attack commands only.

## Deployment boundary

Before this change, public Render PR45 map acceptance passed with two independent browsers: same room, unchanged lobby tick/hash during camera actions, both map modes and a captured west point. This closes the prior map deployment check.

National mode is locally validated but awaits the user's manual Render deployment and public three-nation acceptance. Auto-Deploy remains Off. Real Google login stays deferred. Final geography, resource/XP/reward curves, formal augment roster/stacking, support/defense contribution, and national outcome balance remain explicit open decisions. No phase beyond6 is started.
