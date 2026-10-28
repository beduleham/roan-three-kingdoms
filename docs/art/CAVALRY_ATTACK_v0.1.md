# 기병 전용 근접 공격 v0.1

## 적용 파일

- `apps/client/src/cavalry-attack.svg`: 내장 이미지 생성 도구로 만든 투명 PNG를 그대로 포함한 SVG 컨테이너. 원본 픽셀은 변경하지 않았다.
- `apps/client/src/motion-atlas.json`: 4방향 × 4동작의 16개 프레임 경계, 발 기준점, 표시 배율.
- `apps/client/src/unit-motion.ts`: 기병 실제 공격에 전용 원화를 선택한다. 돌격 중에는 기존 이동 동작을 우선하고 장수에는 기병 원화를 사용하지 않는다.
- `apps/client/src/main.ts`: 원화 로드와 실제 ATTACK_HIT 기반 재생. 앞 단계의 연속 피해 묶음·방향 유지·상태 피드백을 재사용한다.
- 자동/브라우저 테스트: 네 방향, 4프레임, 미래·만료 tick, 돌격 우선순위, 장수 원화 분리, 실제 교전 및 초기화 검증.

## 제작 파이프라인

이미지 생성 스킬의 내장 도구를 사용했다. 기존 `cavalry-canter.svg`에 포함된 원본 PNG를 스타일/캐릭터 참조로 제공했다. 생성 결과 `exec-5a9a44f3-726a-4413-97b1-69d56ec80093.png`는 1254×1254 투명 원화다. 별도 이미지 편집 없이 원본을 SVG 데이터로 포함했다. 알파 채널을 읽어 인접한 두 줄이 alpha≤32인 투명 간격에서 프레임을 분리했고, 모든 프레임의 네 가장자리에 alpha>32인 픽셀이 없음을 확인했다. 원화를 자르거나 배경을 다시 칠한 것이 아니라 로더의 프레임 좌표만 설정했다. 발 하단 기준점과 실루엣 높이에 맞춰 기존 이동 원화와 크기를 맞췄다.

## 생성 프롬프트

```text
Use case: stylized-concept. Asset type: production transparent game sprite sheet for ROAN BAE'S THREE KINGDOMS. Input image is STYLE AND CHARACTER REFERENCE only: preserve the same brown horse, late Han lamellar armored rider, blue cloth and plume, short spear with red tassel, ink outlines and mineral pigment painted military manual style, fixed elevated quarter view. Generate a NEW cavalry MELEE SPEAR THRUST attack sheet. Exactly 4 columns x 4 rows, square image, transparent background. Four sequential distinct attack phases per row: 1 rider draws spear back close to hip, 2 extends spear thrust forward, 3 full thrust and forward lean, 4 retracts spear to ready. Horse stays planted with subtle weight shift; NOT galloping. Row1 faces down-right (front right), row2 down-left (front left), row3 up-left (rear left), row4 up-right (rear right), matching reference directions. Each cell contains exactly ONE complete same rider on same horse at identical scale and anchored hoof position. Generous transparent gutters, keep ALL spear tips, tassels, tails, hooves entirely inside own cell; no crossing cell boundaries. Max silhouette 80% cell height and 80% cell width; shorten spear shaft visually to fit. Four evenly spaced column centers and row centers. No grid lines, no captions or letters, no borders, no scenery, no painted background, no glow/trails/effects, no ground shadows. Crisp dark contours legible at 52px game display. Rider and horse proportions, armor, saddle and colors consistent in all 16 images.
```

## 범위

이동/돌격 달리기와 근접 공격을 구분하는 4방향 원화다. 게임 속 52px 표시 크기에 맞춰 연결했으며 실제 병사 8명 이내의 대표 이미지에만 사용한다. 기존처럼 계산된 피해 이후 동작을 보여주는 피드백이다. 공격 속도·피해량·명중 tick·충돌 판정은 바꾸지 않는다. 별도 돌격 타격 원화, 장수 전용 공격, 대기/피격/패주 원화와 모든 프레임의 수작업 형태 보정은 남아 있다. 방향별 무기·말 비율에 작은 차이가 있어 최종 출시용 원화 검수 완료로 보지 않는다. 새로 확정한 전투 기획 수치는 없다.


## 최종 검증

- 16개 프레임의 알파 경계 검사: 주요 실루엣 잘림 없음(alpha>32 기준).
- `npm run typecheck`: 통과.
- `npm test`: 269개 통과.
- `npm run build`: 통과(기존 대형 번들 경고 유지).
- `npm run format:check`: 통과.
- 실제 Chromium: 최종 소스 브라우저 검사 14개 통과. 실제 기병 공격 4프레임, 일시정지·초기화, 기존 돌격·장수 동작, 90초 UI/헤드리스 상태·이벤트 해시 일치 포함.
- 실제 교전 화면을 확인했다. 다른 부대와 접촉할 때의 병사 이미지 겹침은 이 원화 작업과 별개로 남아 있다.
