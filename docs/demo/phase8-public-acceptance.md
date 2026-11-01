# Phase8 public UI acceptance — 2026-11-01 Korea

Phase8 presentation v1 implementation/local regression and **short public UI acceptance are complete**. Phase9 is not started. Deferred Phase7 human strategy/balance checks remain unvalidated; this browser automation is not real-player balance evidence.

## Deployed build and actual interaction

Origin: <https://roan-three-kingdoms.onrender.com>. The module `/assets/online-BzLKmCta.js` matches the local production build from PR51/main `1ee507f17b67e8c14825436203e799dd617253a1` by asset name and exact decoded JavaScript bytes. SHA256: `f4642df0341cbea5da529acf4f2483d0b3c37a7c507eb2d1510053362a1222e2`. This verifies the client module; it is not a claim to have read Render's private server commit metadata.

Three independent Chromium contexts joined the same newly created private national room as blue/red/green through the real HTTPS/WSS UI. No game-state injection, fake XP, test-only short clock or runtime rule override was used. Canvas/oscillator API hooks observed drawing/audio starts only.

| Check                       | Observed result                                                                                              |
| --------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Public HTML and module      | HTTP200, tested module bytes match                                                                           |
| Private admission and start | Three countries in one private room                                                                          |
| Field projection and art    | Isometric metadata, required art ready                                                                       |
| Inverse input               | Diamond click maps to world tile(1,7); server admits MOVE and selected troop enters MOVE                     |
| Real W cast                 | Successful W marker drawn in the live canvas                                                                 |
| Default mute                | Observed W causes0 oscillator starts while muted                                                             |
| Explicit audio              | User click enables AudioContext, red's successful W starts oscillators; user mute toggles off                |
| Narrow controls             | 390px without horizontal overflow; reduced-effects checkbox works                                            |
| End/consistency             | Green leaves; blue/red show identical abandonment result and human ranking                                   |
| Frozen authority            | Final displayed tick/hash remain unchanged and MOVE is disabled                                              |
| Export                      | Actual JSON download has phase7-v1, correct record schema and abandonment outcome; no invite/reconnect field |
| Browser errors              | 0 page errors in successful scenario                                                                         |

[Machine result](phase8-public-acceptance.json) records the final successful run without invitation keys, account identity or room capability tokens. Pages/clients are cleaned up after testing. One initial full scenario passed, a follow-up with an extra bundle fetch before admission timed out waiting for a first seat, and the final instrumented sequence passed with byte verification after admission. That timeout was not reproduced or attributed to an application defect; it is retained as an observed transient, not silently counted as a pass. This is not a continuous-availability certification.

## Scope and transport boundary

The result is a short real production-room UI smoke. It does **not** certify a new natural15-minute/extension completion, public Q collision/R level unlock, actual speaker quality, long-running/low-end device performance or human growth/augment/support fairness. Local Phase8 tests remain the evidence for the larger controlled scenarios.

The execution environment required its HTTP proxy for Chrome. The browser's test context used an explicit proxy certificate override because this Chrome build did not trust that environment's interception CA. A separate normal curl HTTPS request returned HTTP200 using the environment's normal certificate trust. No Render TLS setting, client security policy, application certificate validation or login setting was changed. The script defaults to normal certificate verification; the override requires an explicit test flag and proxy.

## Reproduce

```
npm ci
npm run build
DEMO_URL=https://roan-three-kingdoms.onrender.com npm run test:presentation:public
```

Use `DEMO_CHROMIUM_PATH` for an installed browser. `DEMO_BROWSER_PROXY`/`HTTPS_PROXY` select the test proxy when required; `DEMO_PROXY_CA_BYPASS=1` is only for an explicitly configured test proxy CA situation. The script never changes production security configuration. It compares against local `apps/client/dist/online.html` and module bytes, creates one isolated private room, performs normal UI commands, downloads the local observation record, ends via normal leave and cleans up. Failures exit nonzero and redact invite fragments.

The public client inspected here is already deployed. This follow-up adds the repeatable inspector and documentation only, and does not change gameplay or the current client bundle.
