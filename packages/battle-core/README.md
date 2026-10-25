# battle-core — Phase 3 장수·무장 스킬 부분

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

- 기본 진입점 @roan/battle-core는 Node 내장 모듈·DOM·네트워크·벽시계에 의존하지 않습니다.
  파일 로더만 @roan/battle-core/node에서 제공합니다.
- createBattle(config, seed, scenario?)는 입력을 복사·검증합니다.
  scenario에는 players/squads/commanders/safeZones를 제공합니다. 고정 contacts와 safe 불리언은 제거했습니다.
- step(state, commands)는 새 state와 해당 tick의 events를 반환하며 입력을 변경하지 않습니다.
  명령은 인증된 playerId와 seq/requestedTick/squadIds를 포함합니다.
- MOVE/ATTACK/ATTACK_MOVE/RETREAT는 지속 명령입니다.
  SET_STANCE/SET_FORMATION은 태세·진형 변경을 요청합니다.
  실제 위치와 사거리, 방향, 완성된 창병 방어진으로 접촉·피해를 계산합니다.
- FSM은 IDLE/MOVE/ENGAGE/CHASE/RETURN/RETREAT/REGROUP 및 ROUTED/BROKEN/DEFEATED입니다.
  FSM_CHANGED, TARGET_ACQUIRED, FORMATION_COMPLETED 이벤트로 상태 변화를 관측합니다.
- Anchor 추격 한도는 defensive 0, balanced 5, aggressive 10타일이며 진형 전환은 15tick입니다.
  직접 이동/후퇴는 자동 교전보다 우선하고 패주·붕괴는 플레이어 명령보다 우선합니다.
- sim:smoke는 최초 ATTACK 두 개만 입력하고 1,000tick 재생합니다.
  입력 순서와 무관한 상태·이벤트 해시, 실제 이동과 지속 교전을 검증합니다.
- 설정의 designStatus는 미검증 메타데이터, status는 전투 상태 설정입니다.
  밸런스 숫자를 변경하지 않았으며 테스트 결과는 실제 게임 밸런스 검증 결과가 아닙니다.
- 시야/전장의 안개·장애물·충돌 회피는 미구현입니다. 임시 공간·방향·안전 정책은
  루트 OPEN_DECISIONS.md를 참고하세요. 운영용 증강 콘텐츠·UI·네트워크는 미구현입니다.

장수는 본대를 동행하며 REASSIGN_COMMANDER로 실제 이동 후 새 본대에 합류합니다.
부상 시 효과가 해제되고 지정 safeZone에서 재출전합니다. 기본 부대 명령에는 지휘 반경을 적용하지 않습니다.

CAST_SKILL은 commanderId, skill(Q/W/R), squadIds를 받습니다. Q는 추가로 적 targetSquadId를 요구합니다.
Q는 실제 준비거리·직선 이동·충돌을 만족해야 CHARGE_IMPACT를 출력합니다.
W는 아군 최대 2부대, R은 Lv.15 이상 자기 근접 최대 3부대를 대상으로 합니다.
새 장수·스킬 smoke도 1,000tick 재생과 입력 순서 변경 시 해시 일치를 검사합니다.

미확정 수치와 지원 정책은 battle_config.v1.json의 warriorAssumptions 데이터에 있습니다.
장수 피해 분배·재배속 취소·효과 중첩 등은 OPEN_DECISIONS.md의 미검증 가정입니다.
Phase 3 전체 완료가 아닙니다. 증강 파이프라인만 구현했으며 운영용 콘텐츠는 없습니다.
검사는 순차 실행하고 테스트 파일 병렬 실행도 비활성화했습니다.

## 증강 처리 기반 (Phase 3 부분)

신뢰된 scenario.augmentDefinitions에 검증된 정의를 전달합니다. 기본값은 빈 배열이며,
합성 정의 3종은 test/fixtures/augments.ts에만 있습니다. 정의 스키마를 기본 진입점에서 제공합니다.
선택은 BattleInput.playerId와 SELECT_AUGMENT { seq, requestedTick, checkpoint, augmentId, squadIds: [] }로 합니다.
다른 플레이어를 지정하는 필드는 없으며 playerId는 인증 계층에서 제공해야 합니다.
초기 제시 후보는 state.augmentProgress에 저장되어 초기 리플레이 스냅샷에 포함됩니다.
후속 제시는 AUGMENT_OFFERED, 선택은 AUGMENT_SELECTED, 효과는 AUGMENT_EFFECT_APPLIED/EXPIRED로 기록합니다.
공격·이동 BP 보정만 지원하며 상세 임시 정책은 OPEN_DECISIONS.md에 기록합니다.

## 실험용 증강 experimental-v0.1

실험 데이터는 기본 진입점에 등록하지 않습니다. 빌드 후 다음처럼 신뢰된 시나리오에 명시적으로 주입합니다.

```ts
import { experimentalAugments } from "@roan/battle-core/experimental-v0.1";
const state = createBattle(config, seed, {
  ...scenario,
  augmentDefinitions: experimentalAugments,
});
```

정의 주입만으로 효과를 얻지는 않습니다. 제시 후보에 대해 플레이어의 SELECT_AUGMENT가 필요합니다.
데이터의 version은 experimental-v0.1이며 모든 수치는 미검증입니다. 운영 기본 정의는 빈 배열입니다.
기존 합성 fixture와 별도이며 운영 밸런스 승인 또는 Phase 3 전체 완료를 의미하지 않습니다.

재현 비교는 npm run sim:experimental로 실행합니다. JSON만 저장하려면 npm run build 후
node packages/battle-core/dist/experimental-cli.js > comparison.json을 실행합니다.
무선택과 각 증강을 같은 시나리오/전투 입력으로 비교하며 attackDamageByA는 전체 기본 공격 피해 합계,
cohesionLostByD는 음수 전열 변화 합계, sampleSquads는 30tick 시점입니다.
상태/이벤트 해시는 각 조건을 두 번 실행하여 비교합니다. 실제 플레이 밸런스 검증은 아닙니다.

이번 실행의 JSON은 [experimental-v0.1-comparison.json](reports/experimental-v0.1-comparison.json)에 저장했습니다.
