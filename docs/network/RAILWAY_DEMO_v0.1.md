# Railway 단일 서비스 게스트 시연

> 현재 배포 대상은 Railway 신규 가입 중단으로 [Render](RENDER_DEMO_v0.1.md)로 변경됐다. 이 문서는 대안 기록이며 실제 Railway 리소스를 생성하지 않았다.

## 배포 대상

- 저장소: `beduleham/roan-three-kingdoms`, 브랜치 `main`, Root Directory는 저장소 루트.
- 프로젝트 권장 이름: `roan-three-kingdoms-demo`; 게임 서비스 하나. Caddy 서비스는 만들지 않는다.
- 루트 Dockerfile로 빌드. `railway.json`이 `/healthz` 상태 검사, 시작 확인 제한 120초, 실패 시 최대 3회 재시작을 지정한다. 시작 명령은 Dockerfile의 CMD를 유지한다.
- 단일 인스턴스와 영구 볼륨을 사용한다. Google 로그인·다중 서버 확장은 이번 범위에 포함하지 않는다.

## 최초 설정 순서

1. Railway 계정을 만들고 ChatGPT의 Railway 앱을 설치·계정 연결한다. Railway에서 GitHub 저장소를 읽는 권한도 해당 저장소에 부여해야 한다. 앱 연결과 GitHub 저장소 권한은 별개다.
2. 프로젝트와 서비스 하나를 만들고 해당 저장소/브랜치에 연결한다. 아래 볼륨과 변수를 설정한 뒤 배포를 실행한다. 먼저 자동 배포가 시작됐다면 설정 후 재배포한다.
3. 게임 서비스에 영구 볼륨을 **`/data`**로 마운트한다. 초기 용량은 계정 시연용 소규모로 시작하되 실제 사용량과 요금은 Railway 계정에서 확인한다. 볼륨을 만들지 않고 배포하면 계정 데이터 보존 조건을 만족하지 않는다.
4. 아래 변수를 설정한다. `RAILWAY_RUN_UID=0`은 Railway의 root 소유 볼륨과 기존 이미지의 node 사용자 간 쓰기 권한을 맞추기 위한 Railway 전용 설정이다. 일반 Docker 구성의 USER node는 변경하지 않는다.

| 변수               | 값                      |
| ------------------ | ----------------------- |
| `PORT`             | `2567`                  |
| `CLIENT_DIST_PATH` | `/app/apps/client/dist` |
| `ACCOUNT_DB_PATH`  | `/data/accounts.sqlite` |
| `RAILWAY_RUN_UID`  | `0`                     |

5. 배포 후 Networking에서 Railway 기본 공개 도메인을 생성하고 대상 포트를 **2567**로 지정한다. HTTPS/WSS는 Railway가 처리한다. 생성된 주소가 `example.up.railway.app`이라면 `CLIENT_ORIGINS=https://example.up.railway.app`를 추가하고 변경 사항을 배포한다. 해당 값에는 `/online.html` 등 경로를 넣지 않는다.
6. 서버를 계속 실행하는 설정으로 유지하고, 인스턴스는 하나로 둔다. 계정 볼륨을 여러 프로세스의 경기 상태 공유 수단으로 사용하지 않는다. 재배포는 진행 중 경기와 메모리 세션을 보존하지 않는다.

## 배포 후 인수 검사

```sh
DEMO_URL=https://실제주소.up.railway.app npm run test:remote
```

`/healthz`, 빌드된 화면, 두 실제 게스트 WS 연결, 동일 초대 Room의 blue/red 좌석, 관측 델타와 같은 tick의 공통 부대 값, 타인 명령 거부를 검사한다. 검사기가 통과해도 브라우저 검증은 별도로 수행한다.

두 독립 브라우저에서 `https://실제주소.up.railway.app/online.html`을 열고 새 초대 전용 경기 → 링크 전달 → 상대 입장 → 명령 실행 → 새로고침 복귀를 확인한다. 초대 키·앱/재접속 토큰은 보고서나 공개 로그에 넣지 않는다. 실제 외부 주소, Railway 배포 상태, WS 검사 결과와 브라우저 검사 결과가 확인되기 전에는 외부 배포/실제 경기 검증을 완료로 표시하지 않는다.

## 현재 작업의 경계

저장소의 Railway 배포 설정과 기존 로컬 검증은 준비됐다. 작성 시점에는 Railway 앱 설치·계정 연결이 확인되지 않았고 Railway 프로젝트/서비스/볼륨/공개 주소를 생성하지 않았다. 계정 연결 후 기존 프로젝트가 있는지 확인한 다음 생성 작업을 진행한다. 중복 프로젝트나 불필요한 두 번째 서비스를 만들지 않는다.

공식 참고: [Dockerfile 배포](https://docs.railway.com/builds/dockerfiles), [설정 파일](https://docs.railway.com/config-as-code/reference), [볼륨 권한](https://docs.railway.com/volumes#permissions), [공개 도메인](https://docs.railway.com/networking/domains/working-with-domains).
