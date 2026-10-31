# Phase 6-1 objective match validation — 2026-11-01 (Korea)

## Scope

Implemented the authorized small match: server-owned nation state, objective capture/contest/takeover, periodic nation scoring, score/time result, end-state authority freeze, result display and a fresh private invitation for the next match. Separate `battle_objectives` room; existing 1v1 and 3v3 demos retained. Rules live in `objective_demo.v1.json` as explicitly experimental assumptions, not confirmed balance. See `docs/network/OBJECTIVE_MATCH_v0.1.md` for unresolved decisions.

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

Objective browser lifecycle tests use a separate test-only server with capture2ticks, scoring every5ticks, goal2 and limit61ticks to exercise complete games quickly. Production imports only the ordinary rule file; client options/URLs cannot enable the short test clock. The normal profile was separately run to a score outcome above. No external Render acceptance of Phase6 has run yet. Auto-Deploy is Off; manual deployment is required after merge.

No balance confirmation, terrain/strategic map, supply, progression integration, 3-nation mode, formal overtime/unification rules or persistent match history is included. Disconnects pause simulation time; permanent departure aborts without a forfeit win pending a design decision.

## Earlier deployment storage evidence

User supplied Render UI and Shell outputs confirming 1GB mounted at `/var/data`, SQLite account files present, and an independent UUID marker retained across a manual redeployment to a different instance. This proves file persistence for that check, not actual Google-account restoration. Real Google login remains deferred.
