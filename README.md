# 쌈국지 현대화 — Codex 전달용 기술 명세 패키지 v1.9

아직 게임 엔진 소스코드를 구현한 결과물이 아닙니다. **기획을 구현 가능한 계약으로 전환한 문서/데이터 묶음**입니다.

## 파일 안내
- `TRD_BATTLE_ENGINE_v1.9.md`: 핵심 전투 로직/상태/계산/AI/이벤트 규칙
- `AGENTS.md`: Codex가 항상 따라야 할 개발 지침
- `CODEX_IMPLEMENTATION_PLAN.md`: 개발 Phase별 수락 조건과 최초 프롬프트
- `TEST_CASES.md`: 구현 후 자동으로 통과시킬 테스트 사양
- `battle_config.v1.json`: 초기 병종/장수/스킬/전투 설정값
- `contracts.ts`: TypeScript 타입 계약(참조 파일이며 런타임 구현 아님)

## 바로 시작하기
1. 빈 Git 저장소 또는 Codex 작업 폴더를 생성합니다.
2. 이 패키지의 파일을 프로젝트 루트에 복사합니다.
3. Codex에 `CODEX_IMPLEMENTATION_PLAN.md` 마지막의 **최초 실행 프롬프트**를 전달합니다.
4. Phase 0/1 테스트 결과를 확인한 후에만 다음 Phase를 개발합니다.

**주의:** 밸런스 수치는 테스트용 초안입니다. 이 패키지는 게임 완성도 또는 승률 균형을 검증한 결과를 포함하지 않습니다.
