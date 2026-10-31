# Google 로그인과 게스트 접속 v0.1

## 범위와 설정

Google 로그인과 기존 게스트 이용을 함께 제공한다. 로그인은 경기 입장 전 선택하며 경기 중에는 계정을 변경하지 않는다. 안정 식별자는 이메일이 아닌 검증된 Google `sub`이며 서버 내부에서만 사용한다. 영구 계정 DB·성장 저장·게스트 기록 병합·계정 차단은 미구현이다.

1. Google Cloud에서 **웹 애플리케이션** OAuth 클라이언트를 만든다. 승인된 JavaScript 원본에 실제 클라이언트 주소를 등록한다. 예: `http://localhost:5173`. `127.0.0.1` 사용 시 그 원본도 별도 등록한다. 팝업 callback 방식이므로 앱 리디렉션 엔드포인트는 사용하지 않는다.
2. 저장소 루트에서 빌드 후 다음처럼 서버를 실행한다. 아래 ID는 실제 웹 클라이언트 ID로 바꾼다. 클라이언트 secret은 필요하지 않다.

```sh
npm ci
npm run build
GOOGLE_CLIENT_ID='YOUR_WEB_CLIENT_ID.apps.googleusercontent.com' CLIENT_ORIGINS='http://localhost:5173,http://127.0.0.1:5173' node apps/server/dist/index.js
```

3. 별도 터미널에서 `npm run dev --workspace @roan/client`을 실행하고 `/online.html`을 연다. 서버 `/auth/config`의 공개 클라이언트 ID로 Google 공식 버튼을 표시한다. ID 미설정 시 게스트를 유지하고, Google 스크립트 로딩 실패도 게스트 입장을 막지 않는다.
4. Google 버튼 → 로그인 확인 → 경기 입장 → 경기 나가기 → 로그아웃을 확인한다. 다른 브라우저의 게스트와 초대 링크 입장도 확인한다. 동의 화면 게시 상태에 맞춰 Google 테스트 사용자를 등록한다.

참고: [Google 설정](https://developers.google.com/identity/gsi/web/guides/get-google-api-clientid), [서버 검증](https://developers.google.com/identity/gsi/web/guides/verify-google-id-token), [GIS API](https://developers.google.com/identity/gsi/web/reference/js-reference).

## 인증 경계

- `POST /auth/challenge`: 서버 난수 256비트 nonce, 5분 유효. GIS 초기화에 사용한다.
- `POST /auth/google`: credential과 nonce를 받는다. Google Auth Library의 `verifyIdToken`으로 서명·발급자·대상 앱·만료를 검사하고 nonce를 대조한다. nonce는 검증 대기 전에 소모해 동시 재사용도 거부한다.
- 성공하면 별도 256비트 불투명 앱 세션을 발급한다. Google 토큰 만료와 발급 후 1시간 중 이른 시각까지 유효하다. Google credential은 저장하거나 URL에 넣지 않는다. 앱 세션만 서버 원본별 `sessionStorage`에 보관한다.
- `GET /auth/session`은 Bearer 세션의 표시 이름과 로그인 수단만 반환한다. `DELETE /auth/session`은 해당 세션을 폐기한다. 인증 응답은 `Cache-Control: no-store`; 브라우저 원본은 `CLIENT_ORIGINS` 목록으로 제한한다.
- Room 입장에서 `accountSession`을 확인한 뒤 기존 초대 검사를 수행한다. 계정과 좌석은 별개이며 명령 권한은 기존 서버 세션→좌석→부대 검사로 결정한다. 유효하지 않은 앱 세션을 보낸 경우 게스트로 자동 전환하지 않고 거부한다.
- 같은 Google `sub`는 한 Room에 한 좌석만 차지한다. 연결 예약 중인 좌석도 포함하며 정상 나가기·예약 만료 시 해제한다. Google 사용자도 초대 키가 필요하다. 이름·이메일을 소유권으로 사용하지 않는다.
- Google 식별자·이메일·세션 토큰은 로비/전투 상태에 넣지 않는다. 표시 이름은 자기 접속에만 전송하고 DOM에서는 텍스트로 출력한다.
- 재접속 토큰은 기존 30초 예약 좌석의 인증 수단이다. 재접속은 원래 신원을 복원하며 Google 팝업을 다시 띄우지 않는다. 앱 세션 만료/폐기는 이후 신규 입장을 막지만 이미 연결된 경기나 예약 좌석을 강제 종료하지 않는다. 로그아웃 UI는 경기에서 나간 뒤 제공한다.

## 한계와 검증

세션과 nonce는 단일 서버 메모리에 각각 최대 1,000개다. 서버 재시작 후 다시 로그인해야 한다. 다중 서버 공유 세션·영구 계정·계정 복구·운영 차단/레이트 제한은 후속 작업이다. 외부 접속은 HTTPS/WSS와 공개 클라이언트 원본 등록이 필요하다. 전투 규칙·밸런스는 변경하지 않았다.

자동 테스트는 테스트 RSA 키로 서명한 JWT와 실제 Google 검증 라이브러리를 사용한다. 키 다운로드만 테스트 인증서로 대체하며 실제 Google 계정 로그인이 아니다. HTTP 인증→실제 Colyseus 입장·중복/초대 검사·재접속·로그아웃을 검증한다. Chromium 검사는 GIS와 인증 HTTP를 모의해 버튼·callback·세션 복원·로그아웃 UI를 검사하고 게스트 접속은 실제 서버에 연결한다. 실제 Google 계정 팝업과 Google 공개 키 통신은 실제 클라이언트 ID가 설정된 환경에서 별도로 확인해야 한다.
