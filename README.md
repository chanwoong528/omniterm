# OmniTerm

macOS용 통합 터미널 & SFTP 클라이언트. SSH(직접/바스천), 터미널 탭, SFTP 파일 탐색·드래그 앤 드롭 업로드, 키 매니저, 세션 저장.

**기술 스택:** Tauri v2, React, TypeScript, Tailwind CSS, xterm.js, ssh2 (Rust).

---

## 다운로드 (설치 파일)

- **[Releases](https://github.com/YOUR_USERNAME/OmniTerm/releases)** 에서 버전별 빌드 파일을 받을 수 있습니다.
- **Apple Silicon (M1/M2/M3)** → `OmniTerm_*_aarch64.dmg`
- **Intel Mac** → `OmniTerm_*_x64.dmg`

---

## 로컬에서 실행

```bash
npm install
npm run tauri:dev
```

---

## 로컬에서 빌드 (설치용 파일 만들기)

**본인 Mac과 같은 아키텍처만** 빌드할 때:

```bash
npm ci
npm run tauri:build:local
```

**Intel(x86_64)용을 Apple Silicon Mac에서** 빌드할 때는 먼저 타깃을 설치한 뒤 빌드하세요:

```bash
rustup target add x86_64-apple-darwin
npm run tauri build -- --target x86_64-apple-darwin
```

생성 위치:

- **앱:** `src-tauri/target/release/bundle/macos/OmniTerm.app`
- **DMG:** `src-tauri/target/release/bundle/dmg/`

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
