# 보병·궁병 방향별 이동·공격 v0.1
기준일: 2026-10-26

## 적용
- 보병: 네 방향 이동·방패/검 공격 시트, 각 16포즈.
- 궁병: 네 방향 이동·시위 당김/발사 시트, 각 16포즈.
- 기존 창병과 공통 footPose 정책. 실제 위치 변화로 이동, ATTACK_HIT 사건으로 최근 공격 여부 판단.
- 코어 facing을 표시 방향으로 사용. 공격 때문에 코어 방향을 돌리거나 명중 판정을 추가하지 않음.
- 공격은 이전 창병과 같은 tick 동기 루프. 단발 4포즈 전체를 정해진 순서로 재생하는 one-shot 시스템은 후속.
- 정지는 첫 이동 포즈 고정. 전용 idle 원화는 아직 없음.

## 화살 표시
- arrow-effect.ts의 순수 표시 함수와 별도 Phaser graphics 계층.
- 실제 궁병 ATTACK_HIT를 받았을 때 표시 계층이 관찰한 공격자/대상 좌표를 복사해 짧은 화살 궤적을 표시.
- 피해 판정은 이미 코어가 계산한 결과. 화살 효과는 추가 피해·비행 판정·충돌을 만들지 않음.
- 과거 정확한 공격 tick 좌표가 사건에 포함되지 않으므로, 여러 tick이 한 렌더에 처리되면 관찰 좌표는 그 렌더의 최종 코어 위치임.
- 표시는 4tick 동안 source→target, 마지막 tick에 대상 도달. 최대 64개, 미래/만료 효과 제외.
- 일시정지 시 같은 tick의 같은 위치 유지, reset 시 캐시 초기화.

## 파일과 원본
- infantry-walk.svg: exec-df979155-f944-40c2-869d-d8f505dc4dba.png.
- infantry-attack.svg: exec-0efbd112-7f63-444e-b5f7-9f7dfa9d7e8b.png.
- archer-walk.svg: exec-95e71991-d205-4778-8098-074abb21173e.png.
- archer-attack.svg: exec-e5284767-1b50-47dc-96dc-b892959fa7c9.png.
- 각 원본 1254×1254, 실제 PNG 픽셀은 변경하지 않고 SVG 컨테이너로 배포.
- motion-atlas.json: 실제 가로/세로 투명 여백에 맞춘 가변 프레임, 기준점, 표시 배율. 64개 프레임 경계의 alpha >32 픽셀 잘림이 없음을 검사.
- 가변 frame 높이를 원래 셀 높이에 맞춰 표시해 frame 사각형 차이에 따른 배율 변화를 줄임.
- main.ts, unit-motion.ts, arrow-effect.ts, unit-motion.test.ts, arrow-effect.test.ts, e2e/demo.spec.mjs.
- 브라우저 테스트는 새 리소스 로딩과 scene 표시 준비 후 입력을 시작하도록 보강.

## 검증
- npm run typecheck: 통과.
- npm test: 209개 통과.
- npm run build: 통과.
- npm run format:check: 통과.
- Chromium 153 실제 브라우저 테스트: 8개 통과.
- 신규 테스트: 보병/궁병 이동 방향과 frame, pause 고정, 실제 보병 공격과 궁병 발사 동작, 화살 표시, reset, headless state/event 해시 일치.
- 기존 Q/W/R, 진형, 카메라, 창병, 무장/기병 동작 유지.
- 실제 90초 실행/900tick 이상 후 headless stateHash/eventHash 일치.
- 실제 foot-combat 스크린샷 육안 확인.
- battle-core와 battle_config 변경 없음.

## 남은 작업
- 8방향 확장, 전용 대기/피격/패주/전멸 및 기병·무장 공격 포즈.
- 신체·장비·접지의 frame 간 수작업 보정, 소속 복식 변형, 접전 시 라벨/병사 가림과 진형 배치.
- 화살과 활시위 동작의 세부 타이밍 연출. 현재 피해 시점과 비행 도착 시점은 같은 의미가 아님.
- 신규 SVG 약 1.80/1.91/1.68/2.20MB, JS 약 3.08MB. 원본/배포 분리와 이미지/atlas 용량 최적화가 필요.
- 동작 연결 초안이며 최종 미술 품질·고증·밸런스 검증이 아님.
