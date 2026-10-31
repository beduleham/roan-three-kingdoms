# Phase 5 Render acceptance and display follow-up

Public URL: https://roan-three-kingdoms.onrender.com/online.html
Deployed source tested: e4a73b0f25f6a941bcb55f074665e3b98eef8226 (PR #40).

## External checks

- HTTPS health and built client served successfully.
- Two real guest SDK clients joined the same private room over WSS, assigned blue/red; common visible squad values matched at the same tick; foreign MOVE rejected with NOT_OWNER.
- Revised CLI forced one missed delta per peer: ok=true, matchingTick=8, resyncs=[1,2], denied=NOT_OWNER. This tests snapshot recovery without accepting corrupt delta hashes.
- Two isolated Chromium contexts joined the public invitation, received blue/red seats, advanced combat, submitted a stance command and displayed its acknowledgement; no pageerror events. Browser traffic used this environment's proxy; proxy certificate verification was bypassed only in the test contexts. This is not validation of the public TLS certificate chain, geographic performance or long-term reliability.
- User also supplied a screenshot of the running red player at tick349.

## Follow-up changes

- Canvas nameplates avoid unit markers and other labels, stay inside canvas edges, and use connector lines. Last-seen labels retain their observed tick and distinct appearance. Only already-projected visible/last-seen data is used; underlying positions, combat rules and vision radius are unchanged.
- Remote acceptance CLI now requests a snapshot for missing bases, waits for it before applying more deltas, and reports resync counts. A matching-base hash mismatch remains fatal. Local acceptance deliberately drops one delta for each client.

## Validation

- Typecheck: passed.
- Unit tests: 356 passed, 27 files.
- Build: passed.
- Production/network Playwright: 4 passed, including forced missing delta recovery, same-origin client/matchmaking, jitter/recovery and actual 30-second seat expiry.
- Formatting: passed.

## Remaining

The follow-up client change needs manual Render deployment (Auto-Deploy is Off). The external checks above ran against PR #40; the revised CLI was run locally against that public server. Persistent disk mount/redeployment account preservation is not verified. Google login remains deferred. Phase 6 and balance changes are outside this work.
