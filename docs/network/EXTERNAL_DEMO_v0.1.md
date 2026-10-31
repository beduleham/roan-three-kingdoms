# 외부 게스트 시연 환경과 네트워크 검증

## 구현 범위

Node 서버가 빌드된 클라이언트, `/healthz`, 인증 API, Colyseus 매치메이킹과 WebSocket을 같은 원본에서 제공한다. 배포 빌드의 클라이언트는 현재 페이지의 원본을 사용해 HTTPS에서는 WSS로 접속한다. 개발 서버의 기존 2567 포트와 명시적 `?server=` 실험 연결도 유지한다. Google 로그인은 보류하고 게스트로 검사한다.

Dockerfile과 Caddy Compose 구성은 **단일 호스트 테스트 배포용**이다. 현재 작업 환경에는 Docker/Caddy 실행 파일 및 외부 서버·도메인이 없어 컨테이너 빌드/실행·공인 HTTPS 인증서·다른 컴퓨터의 실제 인터넷 접속은 검증하지 않았다. 로컬의 실제 Node 서버/빌드된 화면/브라우저/장애 프록시 검증과 외부 배포 완료를 구분한다. Sites의 Cloudflare Worker 환경으로 Colyseus Node/SQLite 서버를 옮기지 않았다.

## Render 권장 배포

Railway 신규 가입 중단으로 현재 배포 대상은 Render 단일 Node 서비스와 영구 디스크로 변경했다. [Render 설정 안내](RENDER_DEMO_v0.1.md)와 루트 `render.yaml`을 우선 사용한다. Render가 HTTPS를 처리하므로 Caddy를 별도로 배포하지 않는다. 기존 [Railway 설정](RAILWAY_DEMO_v0.1.md)은 과거 대안으로 유지하며 아래 Compose 구성은 직접 운영하는 서버용이다.

## 서버와 도메인이 있을 때 배포

Docker Engine과 Compose가 있는 서버에 저장소를 내려받고, 도메인의 DNS를 그 서버로 연결한다. TCP 80/443을 사용할 수 있어야 한다. 저장소 루트에서:

```sh
DEMO_DOMAIN=play.example.com docker compose -f deploy/compose.yaml up -d --build
DEMO_DOMAIN=play.example.com docker compose -f deploy/compose.yaml ps
DEMO_DOMAIN=play.example.com docker compose -f deploy/compose.yaml logs --tail=100 game edge
```

`play.example.com`은 본인 도메인으로 교체한다. 실제 주소는 `https://도메인/online.html`이다. Caddy가 HTTP/HTTPS와 WebSocket을 Node 서버로 전달한다. Compose는 Node 포트 2567을 호스트에 공개하지 않는다. 계정 DB와 Caddy 인증서는 각각 이름 있는 볼륨에 보관한다. `docker compose down -v`는 데이터를 지우므로 계정 보존이 필요하면 사용하지 않는다. 기존 볼륨의 소유권이 다르면 컨테이너의 node 사용자(UID 1000)가 `/data`에 쓸 수 있게 운영 환경에서 설정한다.

배포 시 Google client ID를 넣지 않아도 게스트 기능은 동작한다. `CLIENT_DIST_PATH`에는 클라이언트 `dist`만 지정한다. 저장소 루트나 DB 경로를 웹 루트로 사용하지 않는다. `.dockerignore`가 소스 작업 환경의 DB·환경 파일을 이미지에 넣지 않도록 제외한다. 단일 Node 프로세스이며 계정 데이터만 디스크에 보관한다. 재배포/서버 재시작은 진행 중 경기와 30초 재접속 예약을 보존하지 않는다.

## 배포 후 확인

저장소를 사용할 수 있는 외부 컴퓨터에서:

```sh
npm ci
DEMO_URL=https://play.example.com npm run test:remote
```

검사기는 상태 확인·클라이언트 제공, 같은 비공개 Room의 실제 게스트 SDK 연결 두 개, blue/red 좌석, 국가별 델타 해시, 같은 tick에서 서로에게 보이는 부대 값, 타인 명령 거부를 검사하고 정상 퇴장한다. 외부 주소는 HTTPS만 허용하며 localhost의 HTTP는 로컬 검증용이다. 출력에는 초대 키와 세션/재접속 토큰을 포함하지 않는다.

별도 컴퓨터/네트워크의 두 브라우저에서 `/online.html` → 새 초대 전용 경기 → 초대 링크 복사 → 상대 입장 → 명령 → 새로고침 복귀도 확인한다. 링크의 `#invite=`까지 전달해야 한다. 같은 국가 공유 시야로 인해 양 진영의 전체 상태 해시는 다를 수 있으며, 같은 국가/같은 tick 관측 또는 양쪽에 보이는 부대 값으로 비교한다.

## 재현 가능한 로컬 장애 검사

```sh
npm run test:network
```

Chromium이 필요하며 별도 설치 경로를 사용할 때는 `DEMO_CHROMIUM_PATH`를 지정한다. 이 명령은 전체 빌드 후 4185 포트에 실제 Node 서버를 실행한다. 테스트 전용 TCP 프록시로 실제 HTTP/WS 바이트의 순서를 보존하면서 편도 지연 40/100/60/140ms를 반복 적용하고 연결을 차단한다. 패킷 단위 인터넷 손실률을 재현하는 검사는 아니다.

- 배포 빌드 두 브라우저가 `?server=` 없이 같은 원본과 초대 Room을 사용한다.
- 지연/변동이 있는 브라우저도 관측 상태가 일치하고 서버 명령 응답을 받는다.
- 입장 직후 단절도 즉시 자동 복구 대상이다. SDK의 기본 최소 접속 유지 시간 5초를 0으로 설정해 서버의 기존 30초 예약을 사용한다.
- 단절 시 조작을 비활성화하고 상대가 남은 1대1 경기 tick을 멈춘다. 복구하면 같은 Room·좌석으로 돌아와 관측과 명령을 재개한다.
- 실제 30초 예약보다 길게(31.5초) 차단하면 복구 실패를 표시하고 이전 조작 권한을 정리한다. 신규 입장은 사용자가 접속 버튼을 눌렀을 때만 시도한다.

기존 `npm run test:browser:online`과 `npm run test:online:soak`은 별도로 유지한다. 합성 지연/차단 통과는 특정 국가/통신사의 인터넷 품질, 이동통신 전환, 최대 운영 동시 접속 수를 보증하지 않는다. 전투 종료·승리 조건·밸런스를 추가 확정하지 않았다.

참고: [Colyseus 배포](https://docs.colyseus.io/deployment), [Caddy WebSocket 프록시](https://caddyserver.com/docs/caddyfile/directives/reverse_proxy), [자동 HTTPS](https://caddyserver.com/docs/automatic-https).
