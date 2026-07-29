# 인앱 자동 업데이트 (Auto Update)

> 적용 버전: v0.1.16~ / 작성일: 2026-07-29
> 사용자가 GitHub Release 페이지에 가지 않고, 앱 안에서 새 버전을 확인·다운로드·설치할 수 있다.

## 동작 방식

1. 앱 시작 시 [UpdateBanner](../src/components/update/UpdateBanner.tsx)가 `check()`를 호출해
   `https://github.com/chanwoong528/omniterm/releases/latest/download/latest.json` 을 조회한다.
   (`latest.json`은 릴리스 빌드 시 `tauri-action`이 자동 생성·업로드)
2. `latest.json`의 버전이 현재 실행 중인 버전보다 높으면 타이틀바 아래에 배너가 뜬다.
3. "업데이트" 클릭 → 플랫폼별 업데이트 파일 다운로드 → **minisign 서명 검증** → 설치 → 앱 재시작.
   - macOS: `.app.tar.gz` 로 교체 후 `relaunch()`
   - Windows: 설치 프로그램이 passive 모드로 실행되며 앱을 종료·재설치·재시작
4. 서명 검증에 쓰이는 공개키는 `src-tauri/tauri.conf.json`의 `plugins.updater.pubkey`에 박혀 있다.
   개인키로 서명되지 않은 파일은 설치되지 않는다 (릴리스 위조 방지).

dev 모드(`npm run tauri:dev`)에서는 서명된 번들이 없으므로 업데이트 확인을 건너뛴다.

## 구성 요소

| 위치 | 역할 |
| --- | --- |
| `src/components/update/UpdateBanner.tsx` | 업데이트 확인/다운로드 진행률/재시작 UI |
| `src-tauri/tauri.conf.json` → `plugins.updater` | 공개키 + 엔드포인트 + Windows 설치 모드 |
| `src-tauri/tauri.conf.json` → `bundle.createUpdaterArtifacts` | 업데이트용 아티팩트(.tar.gz/.sig 등) 생성 |
| `src-tauri/capabilities/default.json` | `updater:default`, `process:allow-restart` 권한 |
| `src-tauri/src/lib.rs` | `tauri_plugin_updater` / `tauri_plugin_process` 등록 |
| `.github/workflows/release.yml` | 빌드 시 `TAURI_SIGNING_PRIVATE_KEY`로 아티팩트 서명 |

## 서명 키 (최초 1회 설정)

키 쌍은 이미 생성되어 있다:

- 개인키: `~/.tauri/omniterm.key` — **절대 커밋 금지, 분실 시 기존 사용자에게 업데이트 배포 불가**
- 공개키: `~/.tauri/omniterm.key.pub` — `tauri.conf.json`에 이미 반영됨

분실 대비로 개인키를 안전한 곳(비밀번호 관리자 등)에 백업해 둘 것.
새로 생성해야 한다면: `npx tauri signer generate -w ~/.tauri/omniterm.key`
(공개키가 바뀌면 tauri.conf.json도 갱신해야 하고, **이전 버전 사용자는 자동 업데이트를 받을 수 없게 된다.**)

### GitHub Secrets 등록 (필수 — 안 하면 릴리스 빌드 실패)

레포 → Settings → Secrets and variables → Actions 에 등록:

| Secret | 값 |
| --- | --- |
| `TAURI_SIGNING_PRIVATE_KEY` | `~/.tauri/omniterm.key` 파일 내용 전체 |
| `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | 빈 문자열 (키 생성 시 비밀번호 없이 생성함) |

gh CLI로 한 번에:

```bash
gh secret set TAURI_SIGNING_PRIVATE_KEY < ~/.tauri/omniterm.key
gh secret set TAURI_SIGNING_PRIVATE_KEY_PASSWORD --body ""
```

## 릴리스 절차 (기존과 동일)

기존 릴리스 플로우(`npm run release:bump` → v* 태그 푸시 → Release 워크플로)를 그대로 쓰면 된다.
`createUpdaterArtifacts`가 켜져 있으므로 tauri-action이 자동으로:

1. 플랫폼별 업데이트 아티팩트 + `.sig` 서명 파일 생성
2. `latest.json` (버전·플랫폼별 다운로드 URL·서명 포함) 을 릴리스에 업로드

이후 사용자가 앱을 켜면 배너로 새 버전을 안내받는다.

## 주의사항 / 트러블슈팅

- **업데이트가 적용되는 첫 버전**: 자동 업데이트 코드가 *포함된* 버전(v0.1.16)부터 동작한다.
  즉 v0.1.15 이하 사용자는 마지막으로 한 번 수동 다운로드가 필요하다.
- **릴리스 빌드가 서명 단계에서 실패**: GitHub Secrets 미등록이 원인. 위 표 참고.
- **배너가 안 뜸**: 릴리스에 `latest.json`이 있는지 확인. `[skip release]` 커밋으로 태그만 만든 경우
  tauri-action이 실행되지 않아 `latest.json`이 없다.
- **macOS 미서명(Apple) 빌드**: Tauri 업데이터 서명(minisign)과 Apple 코드사인은 별개다.
  업데이트 자체는 동작하지만 Gatekeeper 경고 문제는 여전히 남는다 → [MACOS_SIGNING.md](./MACOS_SIGNING.md).
- **레포를 private으로 전환하면** `releases/latest/download/latest.json` URL에 인증이 필요해져
  업데이트 확인이 실패한다. 이 경우 별도 업데이트 서버나 프록시가 필요하다.
