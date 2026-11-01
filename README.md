# 쌈국지 현대화 — Codex 전달용 기술 명세 패키지 v1.9

기술 명세와 Phase 0/1/2 및 Phase 3 장수·무장 스킬 부분의 순수 TypeScript headless 전투 코어를 포함합니다.
개발 범위는 CODEX_IMPLEMENTATION_PLAN.md의 단계 번호를 기준으로 합니다.

## 현재 게임 진입 (Phase9 v1)

프로덕션 서버의 `/`는 `/play.html` 시작 화면으로 연결됩니다. 국가전·거점전·1대1/3대3 전투 시연·혼자 연습을 선택할 수 있습니다. 국가전은 국가마다 참가자1명 이상, 총3명 이상이 필요하며 나머지 좌석은 기존 AI가 맡습니다. 로비에서 시작 전 빈 국가·좌석을 선택하고, ‘처음 하는 분’ 안내로 실제 이동·W·진형·결과 흐름을 따라갈 수 있습니다.

`npm run build` 후 기존 서버를 실행하거나, 개발 서버에서 `/play.html`을 여세요. `/index.html`은 기존 로컬 연습, `/online.html?mode=national`은 국가전입니다. [Phase9 범위](docs/network/PHASE9_ENTRY_LOBBY_v1.md)·[검증 결과](docs/demo/phase9-entry-validation.md). 로컬 자동479개/브라우저56개를 통과했으며 Phase9의 Render 공개 인수는 최신 커밋 배포 후 진행합니다.

## 파일 안내

- `TRD_BATTLE_ENGINE_v1.9.md`: 핵심 전투 로직/상태/계산/AI/이벤트 규칙
- `AGENTS.md`: Codex가 항상 따라야 할 개발 지침
- `CODEX_IMPLEMENTATION_PLAN.md`: 개발 Phase별 수락 조건과 최초 프롬프트
- `TEST_CASES.md`: 구현 후 자동으로 통과시킬 테스트 사양
- `battle_config.v1.json`: 초기 병종/장수/스킬/전투 설정값
- `contracts.ts`: TypeScript 타입 계약(참조 파일이며 런타임 구현 아님)

## 바로 시작하기

Node.js 22.13 이상에서 저장소 루트의 다음 명령을 실행합니다.

```sh
npm ci
npm run typecheck
npm run test
npm run sim:smoke
npm run format:check
```

구현 API와 범위는 [battle-core 안내](packages/battle-core/README.md),
미확정 정책과 임시 가정은 [OPEN_DECISIONS.md](OPEN_DECISIONS.md)를 참고하세요.
sim:smoke는 1,000tick headless 교전의 상태·이벤트 해시 재현성을 검사합니다.
Phase 2의 지속 명령·이동·기본 AI·진형을 구현했습니다.
장수 동행·재배속·부상·재출전과 무장 Q/W/R을 추가했습니다. Phase 3 전체는 미완료입니다.
증강 정의 검증·선택·사건 기반 효과 파이프라인을 추가했습니다. 합성 fixture 3종만 검증하며 운영용 증강 콘텐츠는 비어 있습니다.
시야/전장의 안개, 운영용 증강·네트워크·성장 시스템은 아직 구현하지 않았습니다. 로컬 UI는 편성·전투·전멸 테스트 결과·재시험·로그 검증·간략 재생까지 제공합니다.

**주의:** 밸런스 수치는 테스트용 초안입니다. 이 패키지는 게임 완성도 또는 승률 균형을 검증한 결과를 포함하지 않습니다.

## Phase 4 로컬 데모 (최신 브라우저 회귀 검사 미완료)

npm ci 후 npm run dev로 Phaser 클라이언트를 실행합니다. 편성·조작·실험 모드·로그 재현 및 브라우저 검증 방법은
[클라이언트 안내](apps/client/README.md)를 참고하세요. 진행 순서는 demo-order-v0.1로 조정했습니다.
증강은 기본 꺼짐이고 실제 서버 권위/멀티플레이가 아닙니다. Phase 3 운영 콘텐츠와 Phase 4 전체는 미완료입니다. 이전 버전의 실제 브라우저 검증 기록은 있으나 최신 로그 재생·명령 탐색을 포함한 전체 브라우저 검사는 아직 실행되지 않았습니다.

외부 게스트 시연 준비와 네트워크 장애 검사는 [배포/검증 안내](docs/network/EXTERNAL_DEMO_v0.1.md)를 참고하세요. Docker/Caddy 파일은 준비했으며 실제 외부 배포는 서버와 도메인 설정이 필요합니다.

## Phase7 국가 경기 기준 v1

승인된 제안을 실제 국가 경기에 통합했다. [규칙](docs/network/PHASE7_POLICY_v1.md)·[검증 결과](docs/demo/phase7-policy-v1-validation.md)를 먼저 확인한다. `npm run sim:policy`는 정상 시계12경기와 재실행12회의 재현성을 검사한다. 배포 후 `DEMO_URL=https://roan-three-kingdoms.onrender.com npm run test:policy:public`로 짧은 권한/종료 smoke를 실행한다. 지도 공정성과 인간 성장·전략 밀도 인수는 아직 남아 있다.

Phase7 후속: [인수 현황·대조 실험](docs/demo/phase7-acceptance-status.md), [실제 플레이 기록 절차](docs/network/PHASE7_PLAYTEST.md). `npm run sim:roles`는 운영값을 바꾸지 않는 오프라인 역할 대조 검사다. 국가 경기의 **내 경기 기록 저장 (JSON)**은 이 탭에서 관측한 본인 성장/선택/보급과 공개 결과를 내려받는다. 실제 인간 인수·공정성은 사용자 요청으로 보류하고 Phase8 화면 작업에 진입했다. 미검증 상태는 유지한다.

Phase8: [전장 중심 온라인 HUD·공유 병종 아트 작업과 후속 목록](docs/network/PHASE8_GAME_SCREEN.md).

Phase8 화면·연출 v1 개발/로컬 검증 완료: 국가전 쿼터뷰, 사건 기반 스킬/상태 연출, 기본 음소거 효과음, 제한된 리소스/프레임 갱신. [최종 실행 근거](docs/demo/phase8-completion-validation.md). 새 화면의 공개3브라우저 짧은 UI 인수도 완료했다.

Phase8 공개 검증: [Render3브라우저 짧은 UI 인수 결과](docs/demo/phase8-public-acceptance.md). 배포 bundle 바이트와 로컬 검증 빌드가 일치하며, `DEMO_URL=https://roan-three-kingdoms.onrender.com npm run test:presentation:public`로 빌드 후 재검사할 수 있다.
