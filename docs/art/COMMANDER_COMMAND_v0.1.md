# 장수 군령 동작 v0.1

## 기획·코드 확인

현재 battle-core의 일반 공격은 부대가 수행한다. 장수는 Q/W/R 명령의 시전자이며 별도 일반 공격자로 계산되지 않는다. 따라서 장수의 일반 공격을 추가한 것으로 표현하지 않고, 실제 승인된 SKILL_CAST에 대한 군령 동작을 추가했다. 별도의 장수 공격 판정·피해량은 만들지 않았다.

## 적용 파일

- `apps/client/src/commander-command.svg`: 백마·청색 망토 장수의 4방향×4프레임 군령 원화.
- `apps/client/src/motion-atlas.json`: 16프레임, 투명 여백, 발 기준점과 표시 배율.
- `apps/client/src/unit-motion.ts`: 4프레임을 각 2tick씩 재생하는 표시 정책. 승인된 군령이 있고 장수가 ACTIVE이며 서 있을 때 재생한다. 이동·돌격·재배치와 부상·노출 상태가 우선한다.
- `apps/client/src/main.ts`: 실제 SKILL_CAST 관측 시에만 시작 기록을 만들고 동작 중 방향을 고정한다. 전투 초기화에서 기록을 비운다.
- 자동·브라우저 테스트: 방향·프레임 순서·이동 우선순위·장수 상태·미래/만료 tick, W/R 승인 전후·일시정지·초기화·리플레이 검증.

## 원화 제작

이미지 생성 스킬의 내장 도구를 사용했다. 기존 commander-canter.svg의 PNG를 캐릭터/스타일 참조로 제공했다. 첫 결과는 행 사이의 여백이 좁아 두 번째 생성에서 인물과 말을 작게 배치하고 여백을 늘렸다.

최종 원본은 `exec-249443a4-4186-402d-b901-46ad637f3567.png`(1254×1254)다. PNG 픽셀과 투명도를 그대로 SVG 컨테이너에 포함했다. 알파 채널을 읽어 인접한 두 줄이 alpha≤32인 투명 간격을 프레임 경계로 사용했다. 16개 프레임의 모든 가장자리에 alpha>32인 픽셀이 없음을 확인했다. 원화 픽셀을 자르거나 덧칠하지 않았으며 로더 좌표만 설정했다. 팔을 내린 1·4번째 동작의 실루엣 높이를 기준으로 기존 장수 표시 크기에 맞췄다.

## 최종 생성/여백 보정 프롬프트

```text
Use case: stylized-concept. Asset type: transparent 4x4 game animation sprite sheet. Input image is style and character reference only. Preserve exactly this late Han Chinese mounted commander with dark ornate lamellar armor, bronze trim, BLUE cape and blue plume, short spear with blue tassel, WHITE horse with bronze and blue harness. Painted military manual, mineral pigments, dark ink contours, fixed elevated quarter view. Make a NEW COMMAND / RALLY GESTURE sheet, not an attack or galloping animation. Exactly 4 columns and 4 rows on a square transparent canvas. Columns are 4 successive readable poses: 1 hand at chest preparing order, 2 FREE LEFT HAND raised high to rally troops while right hand holds short spear close to body, 3 free left arm points decisively forward toward facing direction, 4 arm lowers back to reins. Horse stands planted with only subtle weight shift. The same commander, armor, cape, spear and white horse in all 16 cells, constant scale and hoof anchor. Row1 faces down-right (front right); row2 down-left (front left); row3 up-left (rear left); row4 up-right (rear right), matching reference. Every complete silhouette, spear tip, cape, tail and hoof remains INSIDE its own cell. Wide transparent gutters, each silhouette at most 80% cell width and 80% cell height. No overlap across cells, no cutting off feet or spear, no extra weapons, no labels, no borders, no grid, no text, no scenery, no shadows, no ground, no colored background, no glow/VFX. Crisp and readable when displayed at 64px in the game.
Spacing correction for this edit target: keep the same commander identity and the four command gestures, but redraw every rider and horse MUCH SMALLER within its cell. Each entire silhouette, INCLUDING the raised hand and all hooves, must fit inside the central 70% of each 1/4-by-1/4 cell. Leave at least 35 fully transparent pixels above and below every silhouette and at least 30 transparent pixels left/right in each cell. Four columns and four rows; consistent scale. Do not enlarge to fill the canvas. Especially preserve generous clear horizontal gutters between rows. No hand or hoof can touch cell edges. Keep true alpha transparency.
```

## 범위와 남은 작업

Q/W/R은 같은 군령 동작을 공유한다. 서 있을 때는 0.8초 동안 손을 들고 전방을 지시하며, 실제 이동 중에는 기마 동작을 유지한다. 스킬의 준비·지속 시간이나 쿨다운을 늘리지 않는다. 여러 명령이 같은 tick에 승인되면 마지막 동작 기록을 사용한다.

현재 동작은 스킬별 전용 연출·일반 공격·피격·패주 원화를 대체하지 않는다. 프레임마다 손·갑옷·말 비율에 작은 차이가 있어 수작업 보정과 최종 미술 검수가 남아 있다. 전투 수치·명중·충돌·스킬 허용 규칙은 변경하지 않았다. 새로 확정한 전투 기획 수치는 없다.


## 최종 검증

- 알파 경계 검사: 16개 프레임의 주요 실루엣 잘림 없음(alpha>32 기준).
- `npm run typecheck`: 통과.
- `npm test`: 278개 통과.
- `npm run build`: 통과(기존 대형 번들 경고 유지).
- `npm run format:check`: 통과.
- 실제 Chromium: 최종 소스의 브라우저 검사 15개 통과. W/R 승인 전후, 군령 프레임 0→1→2→3, 일시정지·초기화·실제 리플레이, 기존 Q 돌격과 기병 공격, 90초 UI/헤드리스 상태·이벤트 해시 일치 포함.
- 실제 전장 화면에서 원화 크기와 군령 표시를 확인했다.
