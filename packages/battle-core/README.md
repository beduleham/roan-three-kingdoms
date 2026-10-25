# battle-core — Phase 1

순수 TypeScript의 결정적 headless 전투 코어입니다. 단계 번호는
CODEX_IMPLEMENTATION_PLAN.md를 따릅니다. Node.js 22 이상과 npm을 사용합니다.

저장소 루트에서 실행:

```sh
npm ci
npm run typecheck
npm run test
npm run sim:smoke
npm run format:check
```

- 기본 진입점 @roan/battle-core는 설정 스키마·검증, 모델 타입,
  createBattle/step, 정수 피해 계산과 canonical 리플레이 해시를 제공합니다.
  파일 시스템·네트워크·DOM·벽시계·난수에 의존하지 않습니다.
- @roan/battle-core/node만 Node.js JSON 파일 로더를 제공합니다.
- createBattle(config, seed, scenario?)는 입력을 복사·검증합니다.
  step(state, commands)는 입력을 변경하지 않고 새 state와 해당 tick의 events를 반환합니다.
  livingSoldiers는 HP 풀에서 병사 수를 계산해 중복 저장하지 않습니다.
- 설정의 designStatus는 미검증 메타데이터, status는 전투 상태 설정입니다.
- sim:smoke는 양방향 접촉 시나리오를 1,000tick 두 번 재생하고,
  입력 배열을 뒤집어도 상태·이벤트 해시가 일치하는지 검사합니다.
  이 결과는 게임 밸런스를 검증한 결과가 아닙니다.
- ATTACK은 이번 tick의 공격 의도입니다. contacts와 safe는 신뢰된 시나리오에서 제공합니다.
  모든 부대의 피해·사기·전열 변화를 계산한 뒤 동시에 반영합니다.
- 패주·붕괴 지속시간, 면역, 비교전 회복을 처리합니다.
  실제 이동·AI·스킬·UI·네트워크는 미구현입니다.
- 미확정 사항과 임시 가정은 루트 OPEN_DECISIONS.md를 참고하세요.
