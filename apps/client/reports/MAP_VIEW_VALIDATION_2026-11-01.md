# Phase 6-2 map views validation — 2026-11-01 (Korea)

## Implemented

The current two-nation, three-objective demo now provides an overview map and a 2x battle camera over the same projected BattleView. The overview draws a viewport rectangle and supports click-to-focus; native buttons focus an objective/selected allied squad or pan the camera. Field selection/movement targets use the inverse camera transform. World coordinates, room, seat, simulation time, score, outcome and nation visibility are shared; camera actions send no battle orders or reconnect requests.

Both canvases render only visible squads, allied vision circles and existing last sightings. Public objective information remains governed by the previously approved demo policy. Camera rendering/transform helpers are client-only; battle core, server and protocol are unchanged. The 24x13-tile display extent is presentation data, not a new movement constraint or final national-map geography.

## Checks performed

- `npm test`: 382 passed in 30 files; seven new camera cases cover projection/inverse at different aspect ratios/zooms, focus bounds, margins and invalid inputs.
- `npm run typecheck`: passed.
- `npm run build`: passed; existing Vite bundle-size/third-party annotation warnings remain.
- `npm run format:check`: passed. Existing objective acceptance report formatting was normalized without changing its meaning.
- `playwright test --config apps/client/maps.playwright.config.mjs`: 4 passed. Two real browsers with ordinary production objective rules checked local-only navigation with identical lobby state, independent views, shared frame ticks, zoomed unit hit testing and movement to a captured objective, continued simulation, fog/last-sighting preservation, frozen results while browsing, and camera reset on a fresh match.
- Objective lifecycle Playwright: 4 passed (start/capture/result/new invitation, odd-tick finish/reload, departure abort and server override/post-finish authority).
- Existing online Playwright: 15 passed, including 1v1/3v3 commands, invitations, reconnect and nation visibility. Mocked Google contract coverage is not real Google login acceptance.
- Production Chromium visual review: overview and east-objective 2x camera, viewport rectangle, Korean labels, fog, buttons and coordinate status inspected. No pageerror events.

Browser total for this change: 23 passed (4 map +4 objective +15 online). The separate four latency/reservation network tests were not rerun for this client-only camera change.

## Limits and rollout

Only the existing demo world is represented. No new three-country/seven-objective geography, terrain occlusion, strategic commands, supply or progression was introduced. Camera positions are local UI state; page reload may reset them while authoritative match state reconnects normally.

Render Auto-Deploy remains Off. Merge does not update the public client; manual deployment and external map-view acceptance remain pending. Google login remains deferred and no accepted combat/capture/scoring values changed.
