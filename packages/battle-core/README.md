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
  루트 OPEN_DECISIONS.md를 참고하세요. 증강·UI·네트워크도 미구현입니다.

장수는 본대를 동행하며 REASSIGN_COMMANDER로 실제 이동 후 새 본대에 합류합니다.
부상 시 효과가 해제되고 지정 safeZone에서 재출전합니다. 기본 부대 명령에는 지휘 반경을 적용하지 않습니다.

CAST_SKILL은 commanderId, skill(Q/W/R), squadIds를 받습니다. Q는 추가로 적 targetSquadId를 요구합니다.
Q는 실제 준비거리·직선 이동·충돌을 만족해야 CHARGE_IMPACT를 출력합니다.
W는 아군 최대 2부대, R은 Lv.15 이상 자기 근접 최대 3부대를 대상으로 합니다.
새 장수·스킬 smoke도 1,000tick 재생과 입력 순서 변경 시 해시 일치를 검사합니다.

미확정 수치와 지원 정책은 battle_config.v1.json의 warriorAssumptions 데이터에 있습니다.
장수 피해 분배·재배속 취소·효과 중첩 등은 OPEN_DECISIONS.md의 미검증 가정입니다.
Phase 3 전체 완료가 아니며 증강은 이벤트 연결점만 제공합니다.
검사는 순차 실행하고 테스트 파일 병렬 실행도 비활성화했습니다.
