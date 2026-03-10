# Windows 다운로드 시 "위험 경고" 없애기 (SmartScreen)

Windows에서 설치 파일(.exe / .msi)을 받고 실행하면 **"Windows에서 PC를 보호했습니다"** 같은 SmartScreen 경고가 뜹니다. 이걸 없애려면 **코드 서명(Code Signing)** 이 필요합니다.

---

## 요약

| 방법 | 비용 | 경고 제거 |
|------|------|-----------|
| **코드 서명 인증서** (OV/EV) | 유료 (연 수만 원~) | 서명 후 빌드하면 경고 감소·제거 가능 |
| **인증서 없음** | 무료 | 사용자가 "추가 정보" → "실행" 눌러야 함 |

인증서 없이는 브라우저로 받은 실행 파일의 SmartScreen 경고를 **완전히** 없앨 수 없습니다. 사용자에게 "추가 정보" → "실행" 안내만 할 수 있습니다.

---

## 1. 코드 서명 인증서 준비

1. **코드 서명용 인증서 구매**
   - **SSL 인증서가 아니라** "Code Signing" 인증서여야 합니다.
   - 발급처 예: [DigiCert](https://www.digicert.com/code-signing), [Sectigo](https://sectigo.com/ssl-certificates-tls/code-signing), [Microsoft 문서 목록](https://learn.microsoft.com/en-us/windows-hardware/drivers/dashboard/code-signing-cert-manage) 참고.
   - OV(Organization Validation): 보통 수만 원/년. 서명 후에도 얼마 동안은 SmartScreen 경고가 남을 수 있음.
   - EV(Extended Validation): 더 비쌈. 서명 직후 신뢰를 받는 경우가 많음.

2. **인증서를 .pfx 형식으로 만들기**
   - 발급받은 `.cer` + 개인키 파일이 있으면:
   ```bash
   openssl pkcs12 -export -in cert.cer -inkey private-key.key -out certificate.pfx
   ```
   - 내보내기 비밀번호를 정하고, **꼭 기억**해 두세요.

3. **Windows에서 .pfx 설치 후 정보 확인**
   - `certificate.pfx` 더블클릭 → 설치 (또는 PowerShell로 import).
   - **certmgr.msc** 실행 → 개인 → 인증서에서 방금 넣은 인증서 선택.
   - **자세히** 탭에서:
     - **지문(Thumbprint)** → `certificateThumbprint` (공백 제거한 값)
     - **서명 해시 알고리즘** → 보통 `sha256` → `digestAlgorithm`
   - 인증서 발급처/문서에서 **타임스탬프 서버 URL** 확인 (예: `http://timestamp.digicert.com`, `http://timestamp.sectigo.com`) → `timestampUrl`

---

## 2. tauri.conf.json에 서명 설정

`src-tauri/tauri.conf.json` 의 `bundle.windows` 에 아래 세 값을 채웁니다.

```json
"bundle": {
  "windows": {
    "certificateThumbprint": "지문값공백제거",
    "digestAlgorithm": "sha256",
    "timestampUrl": "http://timestamp.digicert.com",
    "wix": {
      "language": ["en-US"]
    }
  }
}
```

- `certificateThumbprint`: certmgr에서 본 **지문** (공백·콜론 제거한 40자 hex).
- `digestAlgorithm`: 보통 `sha256`.
- `timestampUrl`: 인증서 발급처가 안내하는 타임스탬프 서버 URL.

로컬에서 **Windows** 머신으로 `npm run tauri build` 하면, 해당 인증서로 서명된 설치 파일이 만들어집니다.

---

## 3. GitHub Actions에서 서명 (선택)

CI에서 Windows 빌드 시에도 서명하려면:

1. **GitHub Secrets 추가**
   - `.pfx` 파일을 base64로 인코딩:
     ```bash
     certutil -encode certificate.pfx base64cert.txt
     ```
   - `base64cert.txt` 안의 내용(헤더/줄바꿈 제외한 본문)을 복사.
   - 저장소 → Settings → Secrets and variables → Actions에서:
     - `WINDOWS_CERTIFICATE`: 위 base64 문자열
     - `WINDOWS_CERTIFICATE_PASSWORD`: .pfx 내보내기 비밀번호

2. **Release 워크플로에 인증서 설치 단계 추가**
   - Windows runner에서만 실행되는 step을 하나 넣어, base64를 디코딩한 뒤 .pfx를 설치하고, 그 다음 `tauri build`가 돌도록 합니다.
   - 예시는 [Tauri 공식 문서 – Windows Code Signing](https://tauri.app/distribute/sign/windows) 의 "Sign your application with GitHub Actions" 참고.

`tauri.conf.json` 에는 이미 `certificateThumbprint`, `digestAlgorithm`, `timestampUrl` 이 들어 있어야 하고, CI에서는 **인증서만** 저장소에 올리지 말고 **Secrets** 로 넣어서 사용하면 됩니다.

---

## 4. 인증서 없을 때 사용자 안내

인증서를 쓰지 않는다면, 다운로드 페이지나 README에 예를 들어 이렇게 안내할 수 있습니다:

> Windows에서 다운로드 후 실행 시 "Windows에서 PC를 보호했습니다" 경고가 나올 수 있습니다.  
> "추가 정보" → "실행"을 눌러 설치를 진행해 주세요. (앱은 서명되지 않은 상태로 배포됩니다.)

---

## 참고 링크

- [Tauri – Windows Code Signing](https://tauri.app/distribute/sign/windows)
- [Microsoft – Code signing](https://learn.microsoft.com/en-us/windows-hardware/drivers/dashboard/code-signing-cert-manage)
