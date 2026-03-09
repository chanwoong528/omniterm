# macOS 코드 서명 및 공증(Notarization) 가이드

배포용 DMG를 빌드할 때 **코드 서명**과 **Apple 공증**을 설정하면, 사용자가 다운로드 후 "손상됨" 경고 없이 앱을 실행할 수 있습니다.

## 사전 요구사항

- **Apple Developer 계정** (유료 $99/년 권장 — App Store 외 배포용 **Developer ID Application** 인증서 필요)
- macOS 기기에서 빌드 (서명은 Apple 정책상 Mac에서 수행)

---

## 1. 인증서 만들기

### 1.1 CSR 생성

1. Mac에서 **키체인 접근** 실행
2. 메뉴 **키체인 접근 → 인증서 지원 → 인증 기관에서 인증서 요청**
3. 이메일, 일반 이름 입력, **디스크에 저장** 선택 후 저장 (`.certSigningRequest`)

### 1.2 Apple Developer에서 인증서 발급

1. [Certificates, IDs & Profiles](https://developer.apple.com/account/resources/certificates/list) 접속
2. **Create a certificate** 클릭
3. **Developer ID Application** 선택 (App Store 제출이 아니면 이걸 사용)
4. 방금 만든 CSR 업로드 후 인증서 생성
5. **Download**로 `.cer` 파일 다운로드 후 더블클릭 → 키체인에 설치

### 1.3 서명 Identity 확인

터미널에서 설치된 서명용 identity 확인:

```bash
security find-identity -v -p codesigning
```

예시 출력에서 **Developer ID Application: Your Name (TEAM_ID)** 형태의 문자열을 복사해 둡니다.

---

## 2. 환경 변수 설정 (로컬 빌드)

서명·공증에 필요한 값만 설정하면 됩니다.

| 변수 | 설명 |
|------|------|
| `APPLE_SIGNING_IDENTITY` | 위에서 확인한 서명 identity 전체 문자열 (예: `Developer ID Application: Hong (ABCD1234)`) |
| `APPLE_ID` | Apple ID 이메일 |
| `APPLE_PASSWORD` | **앱 전용 암호** (일반 비밀번호 아님) |
| `APPLE_TEAM_ID` | (선택) 팀 ID. 보통 identity 괄호 안에 있음 |

### 앱 전용 암호 만들기

1. [appleid.apple.com](https://appleid.apple.com) → 로그인 → **보안** → **앱 전용 암호**
2. **생성** → 이름 입력(예: `OmniTerm notarization`) → 생성된 암호를 복사
3. 이 값을 `APPLE_PASSWORD`로 사용 (한 번만 표시되므로 안전한 곳에 보관)

---

## 3. 빌드 실행

프로젝트 루트에서:

```bash
# 환경 변수 설정 후 (한 번에 실행 예시)
export APPLE_SIGNING_IDENTITY="Developer ID Application: Your Name (TEAM_ID)"
export APPLE_ID="your@email.com"
export APPLE_PASSWORD="xxxx-xxxx-xxxx-xxxx"
export APPLE_TEAM_ID="TEAM_ID"   # 선택

npm run tauri build
```

또는 `.env` 파일을 쓰지 말고, 셸에서 매번 `export` 하거나 스크립트로 감싸서 사용하세요. (`.env`는 보통 git에 넣지 않습니다.)

빌드가 끝나면 Tauri가 서명과 공증을 수행하고, `src-tauri/target/release/bundle/` 아래에 서명·공증된 `.app` 및 `.dmg`가 생성됩니다.

---

## 4. CI/CD (GitHub Actions 등)에서 사용할 때

- **인증서**: 키체인에서 **Developer ID Application** 인증서 + 해당 개인키를 `.p12`로 내보낸 뒤, base64로 인코딩하여 시크릿에 저장  
  - 시크릿: `APPLE_CERTIFICATE`(base64 문자열), `APPLE_CERTIFICATE_PASSWORD`(내보낼 때 설정한 비밀번호)
- **서명 identity**: 위와 동일한 문자열을 `APPLE_SIGNING_IDENTITY` 시크릿으로 저장
- **공증**: `APPLE_ID`, `APPLE_PASSWORD`(앱 전용 암호), `APPLE_TEAM_ID` 시크릿 설정

Tauri 공식 문서의 [macOS Code Signing](https://v2.tauri.app/distribute/sign/macos)와 [tauri-action](https://github.com/tauri-apps/tauri-action) 예제를 참고하면 워크플로 작성에 도움이 됩니다.

---

## 5. 프로젝트에 반영된 설정

- **`src-tauri/tauri.conf.json`**  
  - `bundle.macOS.entitlements`: `Entitlements.plist` 지정 (WebView 등에 필요한 권한)
- **`src-tauri/Entitlements.plist`**  
  - `com.apple.security.cs.allow-jit`  
  - `com.apple.security.cs.allow-unsigned-executable-memory`  
  - `com.apple.security.cs.disable-library-validation`  

서명 identity는 설정 파일에 넣지 않고 **환경 변수 `APPLE_SIGNING_IDENTITY`** 로만 지정하므로, 인증서를 바꿔도 설정 파일 수정 없이 빌드할 수 있습니다.
