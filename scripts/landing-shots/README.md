# landing-shots

랜딩 페이지(`website/`)에 쓰는 스크린샷을 **실제 앱 UI(`src/`)**로 찍는다. Tauri 백엔드는 `@tauri-apps/api/mocks`로 가짜 데모 데이터를 돌려주고, 설치된 Google Chrome을 Playwright로 띄워 DPR 2 PNG로 저장한다.

## 다시 찍기

```bash
npm run shots                          # 전부 (PNG 8장 + manifest.json)
npm run shots -- hero feature-sftp     # 일부만 (manifest의 나머지 항목은 유지)
```

- 필요한 것: macOS, `/Applications/Google Chrome.app`. Playwright 브라우저는 내려받지 않는다(`playwright-core` + `channel: 'chrome'`).
- 출력: `website/src/assets/screenshots/*.png`, `manifest.json` (논리 크기, 보여 주는 내용, ko/en alt 초안)
- 매번 새 임시 Chrome 프로필을 쓴다. 실제 앱의 localStorage, 키 파일, `.mxtsessions`는 읽지도 쓰지도 않는다.
- Vite 서버(127.0.0.1:5199)와 브라우저는 실행이 끝나면(실패해도) 스크립트가 닫는다.

## 어디를 고치나

| 바꾸려는 것 | 파일 |
|---|---|
| 세션, 키, 터미널 출력, SFTP 파일 목록, 업로드 파일 이름 | `demo-data.ts` |
| 장면별 앱 상태(사이드바 너비, 열 탭, 활성 탭, SFTP 경로)와 잘라 낼 영역 | `scenes.ts` |
| 파일 이름, 뷰포트 크기, 크기 제한, manifest 문구(alt) | `capture.mjs`의 `SHOTS` |
| 가짜 백엔드 응답(`invoke` 명령) | `mock-backend.ts` |

데모 데이터 규칙: 진짜 호스트, IP, 사람, 회사 이름을 쓰지 않는다. `*.example.com`, `10.0.x.x`, 사용자 `deploy`/`ubuntu`/`ci`, 키 경로 `/Users/demo/.ssh/...`만 쓴다. 터미널 출력은 한 줄 53자 이하로 둔다. 그래야 데스크톱 샷과 440px 모바일 샷에서 줄이 접히지 않는다.

## 동작 방식

1. `capture.mjs`가 `vite.config.ts`로 Vite 개발 서버를 띄우고, 샷마다 `capture.html?scene=<이름>`을 연다.
2. `capture-entry.tsx`가 장면에 맞게 localStorage(zustand persist 저장소)를 채운다. 그다음 `mockWindows`/`mockIPC`를 설치하고 `src/App`을 렌더링한다.
3. 터미널 탭은 `terminalStore.addTab`으로 연다. 셸 출력은 `spawn_pty_process` mock이 `terminal-output` 이벤트로 흘려보낸다. SFTP 폴더는 실제 더블클릭 이벤트로 연다. 업로드 장면은 `tauri://drag-drop` / `tauri://drag-over` 이벤트를 흉내 낸다.
4. 장면이 잘라 낼 영역을 `window.__shot`에 올리면 드라이버가 그 영역을 찍고 크기 제한과 PNG 픽셀 크기를 검사한다.

앱에 새 Tauri 명령이 생겨 mock이 없으면 `unmocked command` 경고가 뜨고 그 샷이 실패한다. 이때는 `mock-backend.ts`에 응답을 추가한다.

터미널 글꼴: 패키지된 앱(WKWebView)에서는 `ui-monospace`가 SF Mono로 그려진다. Chrome은 `ui-monospace`를 지원하지 않는다. 그래서 캡처 서버가 macOS 시스템 글꼴 `/System/Library/Fonts/SFNSMono.ttf`를 `SFMono-Regular` 이름으로 연결한다. 이 연결은 캡처 서버에서만 쓰이고 앱 코드는 그대로다.
