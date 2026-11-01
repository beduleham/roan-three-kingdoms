> 후속 공개 인수: Render의 client bundle과 로컬 빌드 바이트/SHA256 일치 및 실제3브라우저 짧은 UI 검증을 완료했다. 아래는 당시 로컬 검사 근거이며 [공개 기록](phase8-public-acceptance.md)을 함께 읽는다.

# Phase8 presentation v1 — completion validation, 2026-11-01 Korea

## Evidence boundary

Source baseline is main `418a849db3ea3849f86f589165c1c7fb52c405ec` (PR50 HUD/shared art). This continuation completes the remaining presentation engineering in Phase8: national/objective isometric field, shared-world inverse input/fog projection/depth, procedural state/skill clips, optional synthesized audio, lazy atlas loading, bounded render/effect budgets and a short local reference performance run. Gameplay/balance/server authority remain unchanged. User explicitly deferred Phase7 human balance acceptance. Phase9 is not entered.

All checks below use local builds and actual Chromium, not public acceptance of the new Render client. A manual deploy is still needed. Previous reports remain historical; fresh counts are not the sum of every intermediate retry.

## Functional checks

- Unit/contract suite:470 tests across39 files. Isometric corner/interior round trips at zoom1/2/3, outside diamond/nonfinite rejection, projected radius geometry, observed event dedup/stale/future/hidden filtering, rout/injury transitions, bounded/expired effects, audio activation/mute/volume/visibility/voices, bounded performance samples/background exclusion, lazy art reuse and independent injury clip included.
- TypeScript, production build, Prettier and whitespace diff checks passed. Existing Vite large-chunk/third-party annotation notices remain; no extra runtime dependency was added.
- Actual Chromium: national6, maps4, online15, objectives4, network4 =33 unique cases. National adds actual successful W/R canvas cue observation, default-muted oscillator count0, user-triggered Web Audio oscillator start, mute/reduced-effects UI, and three-client performance sampling. Existing nine-client reconnection/supply/ownership/final ranking, JSON download, viewport movement, fog/last-sighting and real30second reservation expiry remain covered.
- Camera e2e projects intrinsic world coordinates using the published camera transform, then converts to CSS pixels. This preserves the same intended world-click targets on the diamond and rejects padding instead of changing game assertions to match arbitrary screen pixels.
- Desktop and390px screenshots were visually reviewed. Units/labels, diamond terrain/fog, map/HUD placement and controls are present. Procedural recoil/stride/fade and synthesized cues are a presentation v1, not newly painted animation assets or evaluated audio artistry.

The final reduced-motion correction also freezes the commander gait. After that small guard change, the full470-case suite, typecheck/build and focused real-browser Web Audio/reduced-motion case were rerun. The focused repeat is not counted as a34th unique browser case.

## Changed modules

| Module                                                | Change                                                                     |
| ----------------------------------------------------- | -------------------------------------------------------------------------- |
| `map-camera.ts`, `online.ts`                          | Isometric geometry/input/fog/depth, labels, controls and render scheduling |
| `online-army-art.ts`                                  | Lazy shared atlases, state display clips, reduced motion                   |
| `battle-presentation.ts`, `battle-audio.ts`           | Scoped transient events and opt-in synthesized audio                       |
| `render-performance.ts`, `presentation-settings.json` | Bounded instrumentation and presentation budgets                           |
| Client unit/e2e tests, plan/README/network docs       | Reproducible evidence and deferred/external boundaries                     |

## Measured reference and optimization

[Raw final reference sample](phase8-render-sample.json) is generated from three independent Chromium contexts in an accelerated national room. Each report retains180 paint samples; observed rates29.0–29.4fps, JS canvas paint p95 1.0–1.1ms, below the33ms reference render interval. Main draws210–240 times while minimap draws34–37 times in that window. No hardware-wide inference follows from these values.

Initial3-atlas requests are asserted in the browser. Their uncompressed source sum is5,928,494bytes vs17,675,543bytes for all9, a66.5% reduction in this initial source-asset set. This is not a measured HTTP byte/time reduction. Later combat/recruits can request the remaining known cached atlases. We did not silently re-encode/repaint existing artwork.

Effects cap48, event identities2048, concurrent voices6, cue spacing80ms, paint history180samples. Full snapshots establish a visual baseline and do not replay old cues. Final/hidden entities lose effects, hidden tabs stop audio, and no animation clock issues battle commands or advances authority. The frame cap controls presentation only; server tick and synchronization rates are untouched.

## Remaining external step

Deploy latest main manually on Render and inspect a new room. Public UI/sound/device checks await deployment; actual speaker quality, sustained performance on low-end phones and Phase7 human strategy/balance evidence are not certified. The planned Phase8 presentation v1 implementation/local-validation scope is complete; do not convert the external step or deferred human checks into fabricated passes.

## Reproduce

```
npm test
npm run typecheck
npm run build
npm run format:check
DEMO_CHROMIUM_PATH=/path/to/chromium npx playwright test --config apps/client/national.playwright.config.mjs
DEMO_CHROMIUM_PATH=/path/to/chromium npx playwright test --config apps/client/maps.playwright.config.mjs
DEMO_CHROMIUM_PATH=/path/to/chromium npx playwright test --config apps/client/online.playwright.config.mjs
DEMO_CHROMIUM_PATH=/path/to/chromium npx playwright test --config apps/client/objectives.playwright.config.mjs
DEMO_CHROMIUM_PATH=/path/to/chromium npx playwright test --config apps/client/network.playwright.config.mjs
```

The performance case writes `/tmp/phase8-render-sample.json`; the committed report supplements it with source-asset byte sums and the explicit environment boundary. Test fixtures/short clocks never become production options.
