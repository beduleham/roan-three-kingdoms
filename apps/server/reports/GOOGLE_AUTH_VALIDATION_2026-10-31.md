# Google 로그인·게스트 유지 구현 검증 · 2026-10-31

## 변경 파일과 기능

- `apps/server/src/auth.ts`: Google 토큰 검증, 일회성 nonce, 앱 세션 발급·만료·폐기, 원본 제한 HTTP API.
- `apps/server/src/room.ts`, `index.ts`: 인증 API 등록, 계정 입장 검사, 같은 Room 중복 계정 거부, 자기 계정 표시 전송, 재접속 신원 유지. 중복 계정은 `onAuth`에서 좌석 배정 전에 거부한다.
- `apps/client/src/account.ts`, `online.ts`, `online.css`: Google 공식 버튼, 게스트 유지, 세션 복원·로그아웃, 경기 중 계정 변경 차단. Google credential은 저장하지 않는다.
- `apps/server/test/auth.test.ts`: 실제 Google 라이브러리의 테스트 RSA JWT 검증과 실제 HTTP/Colyseus 연동.
- `apps/client/e2e/online.spec.mjs`: Google UI 계약·로그아웃 후 실제 게스트 접속·오류 계정 입장 거부·Google 스크립트 실패 시 게스트 유지.
- `apps/server/package.json`, `package-lock.json`: Google Auth Library, Express와 타입 의존성.
- `docs/network/GOOGLE_AUTH_v0.1.md`, `PHASE5_1V1_v0.1.md`, 서버 README, 개발 체크리스트: 설정·인증 범위·후속 항목 정리.

## 검증

| 명령                                                                                                                                                  | 결과                                                 |
| ----------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| `npm run typecheck`                                                                                                                                   | 통과                                                 |
| `npm test`                                                                                                                                            | 23개 파일, 336개 테스트 통과                         |
| `npx tsc --ignoreConfig --noEmit --skipLibCheck --strict --target ES2022 --module NodeNext --moduleResolution NodeNext apps/server/test/auth.test.ts` | 새 서버 인증 테스트 타입 검사 통과                   |
| `npm run build`                                                                                                                                       | 코어·프로토콜·서버·클라이언트 빌드 통과              |
| `npm run test:online`                                                                                                                                 | 실제 2 SDK 접속·타인 명령 거부·국가 관측 동기화 통과 |
| `DEMO_CHROMIUM_PATH=/workspace/scratch/f8f726b91212/chromium-headless npm run test:browser:online`                                                    | 실제 Chromium 온라인 검사 14개 통과                  |
| `npm run format:check`                                                                                                                                | 통과                                                 |

잘못된 서명·발급자·대상 앱·만료·nonce·subject를 거부했다. nonce 만료/동시 재사용, 앱 세션 만료/폐기, 같은 계정의 동시 입장 시 한 좌석만 허용, 예약 중 중복 거부, 비정상 연결 종료 후 신원 복원, 정상 퇴장 후 재입장, 초대 키 검사를 확인했다. 게스트의 기존 전술·3대3·시야·로비·재접속 회귀도 통과했다.

## 검증 한계와 남은 일

실제 Google 웹 클라이언트 ID가 제공되지 않아 Google 계정 팝업/동의 화면과 공개 키 다운로드를 통한 실제 로그인을 검증하지 않았다. 서버 테스트는 테스트 RSA 인증서로 키 다운로드만 대체하고 공식 라이브러리의 서명·클레임 검증을 실행한다. 브라우저의 Google 로그인 성공 화면은 GIS/인증 HTTP 모의 응답을 사용한 계약 검사다.

세션은 단일 서버 메모리이며 영구 계정 DB·게스트 성장 기록 병합·계정 차단·다중 서버 운영은 미구현이다. 이번 변경에서는 새 900tick 장시간 검사와 Phase 4 로컬 브라우저 전체 검사를 재실행하지 않았다. 전투 규칙·밸런스의 추가 확정은 없다. 다음 실제 연결 단계는 웹 클라이언트 ID 및 승인 원본을 설정한 뒤 Google 사용자와 게스트의 동일 경기 입장·새로고침·로그아웃을 확인하는 것이다.
