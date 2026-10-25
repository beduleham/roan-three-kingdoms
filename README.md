# 쌈국지 현대화 — Codex 전달용 기술 명세 패키지 v1.9

기술 명세와 Phase 0/1의 순수 TypeScript headless 전투 코어를 포함합니다.
개발 범위는 CODEX_IMPLEMENTATION_PLAN.md의 단계 번호를 기준으로 합니다.

## 파일 안내
- `TRD_BATTLE_ENGINE_v1.9.md`: 핵심 전투 로직/상태/계산/AI/이벤트 규칙
- `AGENTS.md`: Codex가 항상 따라야 할 개발 지침
- `CODEX_IMPLEMENTATION_PLAN.md`: 개발 Phase별 수락 조건과 최초 프롬프트
- `TEST_CASES.md`: 구현 후 자동으로 통과시킬 테스트 사양
- `battle_config.v1.json`: 초기 병종/장수/스킬/전투 설정값
- `contracts.ts`: TypeScript 타입 계약(참조 파일이며 런타임 구현 아님)

## 바로 시작하기

Node.js 22 이상에서 저장소 루트의 다음 명령을 실행합니다.

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
Phase 2 AI·이동, 스킬, UI, 네트워크는 아직 구현하지 않았습니다.

**주의:** 밸런스 수치는 테스트용 초안입니다. 이 패키지는 게임 완성도 또는 승률 균형을 검증한 결과를 포함하지 않습니다.
