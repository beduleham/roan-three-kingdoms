# Render 단일 서비스 게스트 시연

## 선택한 구성

Railway 신규 가입 중단으로 배포 대상을 Render로 변경했다. 실제 Railway 서비스/볼륨을 생성한 상태는 아니므로 데이터 이전 작업은 없다. 기존 Railway 설정은 대안 기록으로 유지한다.

루트 `render.yaml`을 Blueprint로 사용한다. GitHub 저장소는 `beduleham/roan-three-kingdoms`, 브랜치는 `main`, Root Directory는 저장소 루트다.

| 항목 | 설정 |
| --- | --- |
| 서비스 | `roan-three-kingdoms-demo` 한 개 |
| 런타임 | Render 네이티브 Node 24.22.1 |
| 리전 | Singapore |
| 인스턴스 | `0.5c-512mb` (기존 Starter), 1개 |
| 빌드 | `npm ci --include=dev && npm run build` |
| 시작 | `node apps/server/dist/index.js` |
| 상태 확인 | `/healthz` |
| 영구 디스크 | 1GB, `/var/data` |
| 계정 DB | `/var/data/accounts.sqlite` |
| 자동 재배포 | 비활성화; 초기 검증 후 수동 배포 |

이 구성은 영구 디스크를 사용하므로 유료 웹 서비스가 필요하다. 실제 생성 전 Render 계정에서 표시되는 컴퓨트·디스크 요금을 확인한다. 무료 서비스로 바꾸거나 디스크를 빼면 계정 데이터 보존 조건을 충족하지 않는다. 512MB는 최초 시연 출발점이며 동시 접속 운영 용량을 보증하지 않는다.

기존 Dockerfile은 직접 운영 서버용으로 유지한다. Render 네이티브 Node를 선택해 Railway 전용 root UID 설정이나 별도 Caddy 없이 기존 빌드/시작 명령을 사용한다. 외부 HTTPS/WSS는 Render가 처리하며 서버는 플랫폼이 지정한 `PORT`를 사용한다.

## 최초 배포 순서

1. Render 계정을 만들고 ChatGPT의 Render 앱을 설치·계정 연결한다. Render의 GitHub 연동에서도 해당 저장소에 접근할 권한을 부여한다. ChatGPT 앱 연결과 GitHub 저장소 권한은 별개다.
2. 기존 동일 프로젝트/서비스가 있는지 확인한 뒤 Blueprint로 위 저장소를 선택한다. 새 서비스는 한 개만 만들고 루트 `render.yaml`을 적용한다.
3. 생성될 유료 서비스와 `/var/data` 디스크를 확인하고 배포한다. `NODE_VERSION`, `NODE_ENV`, `CLIENT_DIST_PATH`, `ACCOUNT_DB_PATH`는 Blueprint에 선언돼 있다. Google client ID와 Railway 전용 변수를 넣지 않는다.
4. Render가 생성한 실제 `https://….onrender.com` 주소와 `/healthz`의 정상 응답을 확인한다. 공개 주소를 임의로 추측하거나 만들어 보고하지 않는다.
5. 아래 원격 검사와 두 브라우저 경기 검증을 수행한다. `CLIENT_ORIGINS`가 없으면 서버가 Render의 `RENDER_EXTERNAL_URL`을 읽어 정확한 HTTPS 원본만 자동 허용한다. 수동 `CLIENT_ORIGINS`가 있으면 그 목록이 우선하며 다른 onrender.com 서비스 전체를 허용하지 않는다. 자체 도메인을 추가하면 명시적 원본 목록도 함께 갱신한다.

## 실제 외부 인수 검사

```sh
DEMO_URL=https://실제주소.onrender.com npm run test:remote
```

상태 확인·빌드된 화면·게스트 SDK 두 연결·같은 비공개 Room의 blue/red 좌석·델타 해시·공통 부대 값·타인 명령 거부를 검사한다. 이어 두 독립 브라우저에서 `/online.html` → 새 초대 전용 경기 → 링크 전달 → 상대 입장 → 명령 실행 → 새로고침 후 같은 좌석 복귀를 확인한다. Google 로그인은 보류한다.

Render 디스크가 있는 서비스는 여러 인스턴스로 확장하지 않는다. 재시작/재배포는 경기 상태·앱 세션·30초 좌석 예약을 보존하지 않는다. 영구 디스크는 계정 레코드 보존용이다. 자동 재배포를 켜기 전 이 중단 특성을 고려한다. 계정 삭제·운영 백업 자동화·경기 종료 규칙은 이번 작업에 포함하지 않았다.

## 현재 상태와 검증 경계

작성 시점에 Render 공식 상태 페이지는 정상 운영으로 표시됐다. 개별 계정의 가입 성공·저장소 권한·결제 가능 여부는 로그인 후 확인해야 한다. Render 앱 설치/계정 연결이 확인되지 않아 실제 서비스·디스크·공개 주소는 생성하지 않았다. YAML 로컬 파싱과 로컬 테스트 통과를 Render API의 Blueprint 승인 또는 실제 외부 배포 완료로 표시하지 않는다.

공식 참고: [상태](https://status.render.com), [Blueprint](https://render.com/docs/blueprint-spec), [Node 런타임](https://render.com/docs/language-support), [영구 디스크](https://render.com/docs/disks), [기본 환경 변수](https://render.com/docs/environment-variables).
