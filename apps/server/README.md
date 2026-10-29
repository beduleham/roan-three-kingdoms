# Phase 5 · 서버 권위 1대1 수직 시연판

기존 Phase 4 로컬 데모와 분리된 `/online.html` 시연 화면입니다. 두 접속자가 같은 Colyseus Room에 들어가면 서버만 `battle-core.step()`을 100ms tick으로 실행합니다. 접속 순서로 blue/red 좌석을 배정하고 각자 2개 부대를 지휘합니다. 시연 편성은 양측 창병·궁병 각 20명, seed 41, 시작 Lv.16으로 고정하며 운영 밸런스 확정이 아닙니다.

## 실행

저장소 루트에서 Node 22 이상으로:

```sh
npm ci
npm run build
node apps/server/dist/index.js
```

별도 터미널에서 `npm run dev --workspace @roan/client`을 실행하고 표시된 주소의 `/online.html`을 두 브라우저 창에서 엽니다. 서버 기본 포트는 2567이며 `PORT`로 바꿀 수 있습니다. 클라이언트 주소가 다르면 `?server=ws://HOST:PORT`를 사용합니다.

## 권위와 검증

- 클라이언트는 명령 의도만 보냅니다. 서버는 Colyseus 세션 ID로 좌석을 찾아 `playerId`, `seq`, `requestedTick`을 채웁니다. 타인 부대·장수 명령을 즉시 거부하고 유효한 입력은 다음 tick에 코어가 다시 검증합니다.
- 최초 접속·재접속에는 전체 상태를 보내고, 이후 200ms마다 변경된 필드만 전송합니다. 클라이언트는 tick·상태 해시를 검증하며 기준 tick이 맞지 않으면 전체 상태를 다시 요청합니다. 렌더링 위치만 전후 서버 상태 사이에서 보간합니다. `battle-core`의 상태는 클라이언트가 변경하지 않습니다.
- 연결이 끊기면 최대 30초간 좌석을 보존하고 경기 tick을 멈춥니다. 같은 탭의 새로고침은 `sessionStorage`의 재접속 토큰으로 원래 진영에 복귀합니다. 30초가 지나면 좌석을 해제합니다.
- `npm run test:online`은 실제 서버와 두 SDK 접속으로 같은 Room·좌석·타인 명령 거부·동일 tick 해시를 확인합니다.
- `npm run test:browser:online`은 두 실제 페이지의 상태 일치와 명령 거부를 검사합니다. Chromium이 설치된 환경에서 실행해야 합니다.

## 미구현

계정 인증·3대3 로비·AI 빈자리 보충·Colyseus Schema 기반 동기화·정식 승리 규칙은 아직 없습니다. 현재 필드 델타는 `packages/protocol`의 작은 전송 규약이며 전장의 안개나 플레이어별 정보 가림 기능이 없습니다. 이 시연판은 공개 서비스 배포용이 아닙니다.
