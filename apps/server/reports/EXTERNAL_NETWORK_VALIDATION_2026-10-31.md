# 외부 시연 준비·네트워크 장애 검증 · 2026-10-31

## 변경 파일과 결과

- `apps/server/src/http.ts`, `index.ts`: 빌드된 클라이언트만 정적 제공, 같은 원본 HTTP/매치메이킹/WS, 상태 확인. 계정 DB·환경 파일·서버 소스 접근 제외.
- `apps/client/src/online.ts`: 배포 빌드는 현재 원본의 WS/WSS를 기본 사용. 입장 직후 단절도 재접속하도록 SDK 최소 유지 시간을 0으로 설정. 복구 실패 시 명령·좌석 표시·재접속 토큰을 정리하고 실패 안내.
- `Dockerfile`, `.dockerignore`, `deploy/compose.yaml`, `deploy/Caddyfile`: 단일 Node 프로세스와 Caddy HTTPS/WS 프록시, 내부 포트, 계정/인증서 볼륨 구성.
- `apps/server/test/http.test.ts`: 정적 배포 경계/상태 확인/잘못된 빌드 경로 검사.
- `apps/server/test-support/fault-proxy.mjs`, `apps/client/network.playwright.config.mjs`, `e2e/network.spec.mjs`: 실제 TCP HTTP/WS 지연과 단절, 두 브라우저의 같은 원본 접속·일시 중지·예약 복귀·예약 만료 검사.
- `apps/server/test-support/remote-smoke.mjs`: 배포 주소에서 실제 게스트 SDK 두 연결의 입장·관측·타인 명령 거부 검사. 로컬 서버 대상으로 실행 확인.
- `package.json`, README, 서버 README, 개발 체크리스트, `docs/network/EXTERNAL_DEMO_v0.1.md`: 실행 명령·배포 절차·검증 한계 기록.

## 검증 기록

| 검사                                       | 결과                                      |
| ------------------------------------------ | ----------------------------------------- |
| `npm run typecheck`                        | 통과                                      |
| `npm test`                                 | 25개 파일, 349개 테스트 통과              |
| 새 HTTP 테스트 별도 strict TypeScript 검사 | 통과                                      |
| `npm run test:network`                     | 전체 빌드 및 배포/장애 인수 검사 4개 통과 |
| `npm run format:check`                     | 통과                                      |
| Compose YAML 파싱·내부 포트/볼륨 구조 검사 | 통과; Docker 실행 검증과 구분             |

Chromium 실행 경로는 `DEMO_CHROMIUM_PATH=/workspace/scratch/f8f726b91212/chromium-headless`다. Node 24.22.1에서 검사했다. 편도 TCP chunk 지연 40/100/60/140ms를 반복 적용하며 실제 SDK/브라우저와 서버를 연결했다. 응답을 모의하거나 전투 상태를 직접 바꾸지 않았다. 같은 tick의 공통 관측 부대 값을 비교했고, 각 델타는 기존 클라이언트의 국가별 해시 검사로 적용했다.

900tick 검사는 90.32초 동안 실행됐고 타인 명령/형식 오류를 각각 45회 거부했다. 기록된 최종 관측 해시는 blue `c6d73b111df5a228`, red `2291b2cccaa32cc4`이며 서로 다른 국가 해시가 같아야 하는 검사는 아니다.

첫 장애 검사에서 입장 직후 5초 미만이면 SDK 기본 설정이 자동 재접속을 포기하는 문제를 재현했다. `minUptime=0`으로 수정한 뒤 같은 검사에서 통과했다. 단절 시 조작 중단·1대1 tick 정지, 재연결 후 같은 Room/좌석과 명령 응답을 확인했다. 실제 예약 시간 30초를 단축하지 않고 31.5초 이상 차단해 자동 복구 실패·권한 표시 정리·사용자 버튼에 의한 신규 입장을 검증했다.

## 완료와 미완료의 경계

외부 배포용 소스·설정·검사 명령 준비와 **로컬 실제 통신의 합성 장애 검사**를 완료했다. 외부 호스팅에 배포한 완료 상태가 아니다. 현재 환경에 Docker/Caddy 실행 파일이 없어 컨테이너 빌드·실행과 Caddy 설정 실기동은 미검증이다. 외부 서버/도메인이 제공되지 않아 공인 TLS, 원격 WSS, 서로 다른 컴퓨터/통신망의 실제 인터넷 접속은 미검증이다. 제공된 Sites 호스팅은 Worker 런타임이라 기존 Node/SQLite 구조로 배포하지 않았다.

Google 로그인은 사용자 요청에 따라 보류했다. 전투 규칙·밸런스·승패·경기 종료·Phase 6 기능은 변경하지 않았다. 다음 배포에 필요한 입력은 사용할 Node/Docker 서버와 연결할 도메인이다. 실제 호스트에서는 문서의 Compose 실행 후 `DEMO_URL=https://도메인 npm run test:remote`와 별도 브라우저 검사를 수행해야 한다.
