# battle-core — Phase 0

순수 TypeScript 전투 코어의 개발 기반입니다. 전투 엔진은 아직 구현하지 않았습니다.
Node.js 22 이상과 npm을 사용합니다. 루트 package-lock.json으로 버전을 고정합니다.

저장소 루트에서 실행:

```sh
npm ci --cache /workspace/.npm-cache
npm run typecheck
npm test
npm run sim:smoke
npm run format:check
```

- strict 타입 검사에는 참조 contracts.ts도 포함됩니다.
- Zod 스키마는 모든 설정 필드, 숫자 범위, 필수 병종/상성,
  사기 임계값 순서와 증강 레벨 순서를 검사합니다.
- 기본 진입점 @roan/battle-core는 Node.js에 의존하지 않는 설정 스키마,
  parseBattleConfig 검증 함수, BattleConfig 타입만 제공합니다.
- JSON 파일을 읽는 loadBattleConfig는 별도 Node 전용 진입점
  @roan/battle-core/node에서 제공합니다. smoke도 이 진입점을 사용합니다.
- sim:smoke는 빌드 후 원본 설정 로딩을 검증하고
  simulationImplemented: false를 출력합니다. 전투 시뮬레이션 검증이 아닙니다.
- 원본 JSON은 status 키를 중복 선언합니다. 표준 JSON.parse에 따라
  뒤쪽 상태 설정 객체가 사용됩니다. 원본 파일과 밸런스 수치는 수정하지 않았습니다.
- Phase 1의 createBattle/step, 피해 계산, 상태 전이, 리플레이 및 게임 UI/서버는 미구현입니다.
