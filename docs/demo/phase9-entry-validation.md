# Phase9 entry/lobby/guidance validation — 2026-11-01 Korea

Baseline: main `68b03c244b515bfd7d03694002cc4036b5c0e51b` (Phase8 public acceptance). This change implements Phase9 entry/home, mode routes, pre-game session-owned country/seat selection, quorum guidance, contextual admission errors and observation-driven beginner instructions. Phase10 and deferred human balance/Google acceptance are not included.

## Behavior and evidence

- Production HTTP root redirects to `/play.html`; all three built entries are required and sensitive source/account files remain blocked. Existing online invitation URLs and `/index.html` local practice remain available. The welcome page loads no battle atlas/engine until a mode is opened.
- Pre-game seat selection does not mutate the battle state. Unit checks cover host continuity, same-seat idempotence, reserved/occupied slots, disconnected/unknown callers, malformed slots, both-team/three-country quorum, post-start rejection, current human IDs and loss of the previous slot's command ownership.
- Real room/browser checks change host blue→green→blue, inspect new own-unit lists, retain host control, show missing-country blocker, resume canvas frames after a nation snapshot, then start and obtain the correct final ranking. An extra real SDK client attempts an occupied seat, a spoofed extra-field request and an in-game switch; all are refused.
- Welcome links/mode explanations and390px overflow are inspected in Chromium. The solo guide follows actual start/movement, W target selection/execution and completed formation. Online guidance follows real current-session observations through result and JSON download. UI actions never inject XP/authority state or issue skills automatically.
- Initial iterations exposed an uninitialized pre-admission hint, a trusted fixture's intentionally wiped blue-3 slot, and the missing local W target-selection instruction. The hint is initialized, the seat test uses a living normal slot, and the W instruction/real-click flow is corrected. The failures are not claimed as passes.
- Guide progress is volatile and scoped to this room/seat or local reset. It is an aid, not saved account progression, proof of human participation or usability certification. The accelerated national fixture still deliberately changes clock/growth for coverage; production keeps its existing profile.

## Checks

The final validation passed 479 unit tests in41 files, type checking, production build and format checking. Browser coverage is56 unique cases: national8, local21 (including90seconds real-clock replay and the new solo guide), online15, maps4, objectives4 and network4. Final national/online reruns cover the completed online-guide assertions and the folded lobby detail; reruns are not additional unique cases.

The welcome desktop/narrow screenshots were visually inspected. These are local production-build/dev-server results, not a claim that the new client/server has already been deployed to Render.

## Reproduce

```
npm test
npm run typecheck
npm run build
npm run format:check
DEMO_CHROMIUM_PATH=/path/to/chromium npx playwright test --config apps/client/national.playwright.config.mjs
DEMO_CHROMIUM_PATH=/path/to/chromium npx playwright test --config apps/client/playwright.config.mjs
DEMO_CHROMIUM_PATH=/path/to/chromium npx playwright test --config apps/client/online.playwright.config.mjs
DEMO_CHROMIUM_PATH=/path/to/chromium npx playwright test --config apps/client/maps.playwright.config.mjs
DEMO_CHROMIUM_PATH=/path/to/chromium npx playwright test --config apps/client/objectives.playwright.config.mjs
DEMO_CHROMIUM_PATH=/path/to/chromium npx playwright test --config apps/client/network.playwright.config.mjs
```

After manual deployment, validate root→welcome→correct mode→private invitation→country/seat snapshot→start quorum→actual commands→result/download in a new room. Do not migrate a running match or silently enable new human/AI-nation, surrender or account policies.
