# Phase 6-1 objective match validation — 2026-11-01 (Korea)

## Scope

Implemented the authorized small match: server-owned nation state, objective capture/contest/takeover, periodic nation scoring, score/time result, end-state authority freeze, result display and a fresh private invitation for the next match. Separate `battle_objectives` room; existing 1v1 and 3v3 demos retained. Rules live in `objective_demo.v1.json` as a separate demo profile. The user subsequently approved its current values and behavior as the demo baseline (PR #43); this does not establish verified competitive balance. See `docs/network/OBJECTIVE_MATCH_v0.1.md` for unresolved decisions.

## Executed checks

- `npm run typecheck`: passed.
- `npm test`: 375 passed / 29 files (19 new core/server cases).
- `npm run build`: passed. Existing Vite large-chunk and third-party annotation warnings remain.
- `npm run format:check`: passed. Root objective JSON also explicitly formatted.
- Objective Playwright: 4 passed. Real two-browser start → capture → scores → common result → fresh private room; odd tick61 deadline draw and reload/reconnect restoring final result; permanent departure abort; SDK ignores join-time rule override and rejects post-result commands with MATCH_FINISHED.
- Existing production/network Playwright: 4 passed, including ordered jitter, temporary loss/recovery and actual 30-second reservation expiry.
- Existing online Playwright: 15 passed, including ownership, private invitations, 3v3 AI/human seats, nation visibility, guest flow and mocked Google contract. These do not constitute real Google login verification.
- Default (unaccelerated) server profile headless completion: blue-1 to west, blue-2 to center, red squads to east, all through normal session-bound MOVE commands. Score result at tick400: blue12/red8; west/center blue and east red. This is a reproducible functional run, not a balance result or evidence of fair play.
- Default production build visual review: two Chromium pages joined and started a normal objective match, rendered objective circles, rules, clock, scoring and controls; no pageerror events.

## Test limitations

Objective browser lifecycle tests use a separate test-only server with capture2ticks, scoring every5ticks, goal2 and limit61ticks to exercise complete games quickly. Production imports only the ordinary rule file; client options/URLs cannot enable the short test clock. The normal profile was separately run to a score outcome above. The initial implementation required manual deployment because Auto-Deploy is Off. Public acceptance after the user's deployment is recorded below.

No balance confirmation, terrain/strategic map, supply, progression integration, 3-nation mode, formal overtime/unification rules or persistent match history is included. Disconnects pause simulation time; permanent departure aborts without a forfeit win pending a design decision.

## Earlier deployment storage evidence

User supplied Render UI and Shell outputs confirming 1GB mounted at `/var/data`, SQLite account files present, and an independent UUID marker retained across a manual redeployment to a different instance. This proves file persistence for that check, not actual Google-account restoration. Real Google login remains deferred.

## Public Render acceptance after deployment — completed 2026-11-01 (Korea)

URL: https://roan-three-kingdoms.onrender.com/online.html?mode=objectives

- Two isolated real Chromium browser contexts joined one private objective room over the public service. The UI showed the approved demo baseline: 1.5-tile radius, 3-second capture, 5-second income, 12-point target and 180-second limit.
- Through ordinary UI commands, blue squads moved to west/center and red squads to east. West capture was observed. Both browsers subsequently displayed `blue 승리 · 목표 점수 · 최종 blue 12 : 8 red` at tick400.
- Both browsers disabled movement controls after the result, the battle clock remained unchanged, and a new private room was successfully created with zeroed scores. Both peers left their rooms during cleanup. No browser pageerror events occurred.
- An independent pair of real WSS SDK clients confirmed join options could not override targetScore12/limitTicks1800; a foreign MOVE was rejected with NOT_OWNER; permanent departure resulted in abandoned with no winner; a subsequent own-unit command was rejected with MATCH_FINISHED. Both SDK clients were cleaned up.
- The public browser test used the actual default rules, not the accelerated acceptance server. Traffic used the execution environment's proxy and browser test contexts bypassed proxy certificate validation; this is not a public certificate-chain audit or a geographic latency/load benchmark.
- External acceptance for Phase6 items1–4 is complete. Actual Google-account restoration, progression, formal national match rules and later Phase6 work remain outside this validation.
