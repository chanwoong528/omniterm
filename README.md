# OmniTerm

macOS 및 Windows용 통합 터미널 & SFTP 클라이언트. SSH(직접/바스천), 터미널 탭, SFTP 파일 탐색·드래그 앤 드롭 업로드, 키 매니저, 세션 저장.

**기술 스택:** Tauri v2, React, TypeScript, Tailwind CSS, xterm.js, ssh2 (Rust).

---

## 다운로드 (설치 파일)

- **[Releases](https://github.com/YOUR_USERNAME/OmniTerm/releases)** 에서 버전별 빌드 파일을 받을 수 있습니다.
- **macOS – Apple Silicon (M1/M2/M3)** → `OmniTerm_*_aarch64.dmg`
- **macOS – Intel** → `OmniTerm_*_x64.dmg`
- **Windows** → `OmniTerm_*_x64-setup.exe` 또는 `OmniTerm_*_x64.msi`

---

## "손상됨" 경고 없이 실행하기

DMG를 다운로드한 뒤 앱을 실행하려고 하면 macOS에서 **"손상되었기 때문에 열 수 없습니다"** 라는 메시지가 나올 수 있습니다. 앱이 실제로 손상된 것이 아니라, 인터넷에서 받은 앱에 대한 보안 정책 때문입니다. 아래 순서대로 하면 정상적으로 실행할 수 있습니다.

### 1. DMG에서 앱 복사하기

1. 다운로드한 **`OmniTerm_0.1.3_aarch64.dmg`** (또는 해당 버전의 DMG)를 **더블클릭**해서 디스크 이미지를 엽니다.
2. 열린 창에서 **OmniTerm.app**을 **응용 프로그램** 폴더로 드래그해서 복사합니다. (다른 폴더에 넣어도 됩니다.)

### 2. 터미널에서 quarantine 속성 제거하기

**터미널**(Spotlight에서 "터미널" 검색 후 실행)을 연 뒤, 아래 중 앱을 넣은 위치에 맞는 명령을 **그대로 복사해서 실행**하세요.

- **응용 프로그램** 폴더에 넣었다면:
  ```bash
  xattr -cr /Applications/OmniTerm.app
  ```
- **다운로드** 폴더에 그대로 두었다면:
  ```bash
  xattr -cr ~/Downloads/OmniTerm.app
  ```
- **바탕화면** 등 다른 폴더에 넣었다면, `경로/OmniTerm.app` 부분만 실제 위치로 바꿔서 실행하세요.
  ```bash
  xattr -cr ~/Desktop/OmniTerm.app
  ```

비밀번호를 묻으면 Mac 로그인 비밀번호를 입력하면 됩니다. 한 번만 실행해 두면 됩니다.

### 3. 앱 실행하기

이제 **OmniTerm.app**을 더블클릭해서 실행하면 "손상됨" 메시지 없이 열립니다.

---

## 로컬에서 실행

```bash
npm install
npm run tauri:dev
```

---

## 로컬에서 빌드 (설치용 파일 만들기)

**macOS – 본인 Mac과 같은 아키텍처만** 빌드할 때:

```bash
npm ci
npm run tauri:build:local
```

**macOS – Intel(x86_64)용을 Apple Silicon Mac에서** 빌드할 때는 먼저 타깃을 설치한 뒤 빌드하세요:

```bash
rustup target add x86_64-apple-darwin
npm run tauri build -- --target x86_64-apple-darwin
```

**Windows** 에서 빌드할 때:

```bash
npm ci
npm run tauri build
```

생성 위치:

- **macOS 앱:** `src-tauri/target/release/bundle/macos/OmniTerm.app`
- **macOS DMG:** `src-tauri/target/release/bundle/dmg/`
- **Windows:** `src-tauri/target/release/bundle/msi/` 또는 `nsis/`

---

## 릴리스 빌드 (GitHub에서 자동)

1. **버전 올리기**  
   `src-tauri/tauri.conf.json` 의 `version` 과 `package.json` 의 `version` 을 맞춰 수정합니다.

2. **태그 푸시로 빌드·릴리스**  
   같은 버전으로 태그를 만들고 푸시하면 GitHub Actions 가 빌드 후 **Draft Release** 에 DMG 를 첨부합니다.

   ```bash
   git tag v0.1.0
   git push origin v0.1.0
   ```

3. **또는 `release` 브랜치로**  
   `release` 브랜치에 푸시해도 동일 워크플로가 실행됩니다.

4. **GitHub**  
   저장소 **Actions** 탭에서 진행 상황을 보고, **Releases** 에서 Draft 를 열어 첨부된 파일을 확인한 뒤 **Publish** 하면 됩니다.

---

## 요구사항

- **Rust 1.85+** (빌드 시, [docs/RUST-VERSION.md](docs/RUST-VERSION.md) 참고)
- **Node.js 18+**

---

## 라이선스

MIT
