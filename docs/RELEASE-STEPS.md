# GitHub Release – 단계 정리

릴리스(설치 파일 생성 및 GitHub Release 업로드)는 **두 가지 워크플로**가 연관됩니다.

---

## 워크플로 요약

| 워크플로 | 트리거 | 하는 일 |
|----------|--------|----------|
| **Bump Version** | `main` 브랜치에 push | 버전 올리기 → 태그 생성·push → **Release 워크플로 실행** |
| **Release** | 태그 `v*` push / `release` 브랜치 push / 수동 실행 | macOS·Windows 빌드 → GitHub Release에 파일 업로드 |

---

## 방법 A: 자동 릴리스 (main에 push만 하면 됨)

1. **변경 사항을 `main`에 push**
   ```bash
   git checkout main
   git add .
   git commit -m "feat: 새 기능"
   git push origin main
   ```

2. **Bump Version이 자동 실행**
   - `package.json`, `tauri.conf.json`, `Cargo.toml`의 버전을 패치 업 (예: 0.1.5 → 0.1.6)
   - 커밋 메시지에 `[skip ci]` 넣어서 해당 커밋으로는 다시 워크플로가 안 돌게 함
   - 새 버전 태그 생성 후 push (예: `v0.1.6`)

3. **태그 push로 Release가 자동 실행**
   - macOS (Apple Silicon / Intel), Windows 빌드
   - 빌드된 파일을 해당 태그의 **GitHub Release**에 업로드

4. **결과 확인**
   - GitHub → **Releases** 탭에서 새 버전(예: v0.1.6) 확인
   - DMG, Windows 설치 파일 등 다운로드 가능

---

## 방법 B: 수동으로 특정 버전 릴리스

버전을 직접 정하고 싶을 때 (예: 0.2.0 같은 마이너 버전).

1. **로컬에서 버전 통일**
   - `package.json` → `version`
   - `src-tauri/tauri.conf.json` → `version`
   - `src-tauri/Cargo.toml` → `version`  
   모두 같은 값으로 수정 (예: `0.2.0`).

2. **main에 버전 커밋 후 push**
   ```bash
   git add package.json package-lock.json src-tauri/tauri.conf.json src-tauri/Cargo.toml
   git commit -m "chore: release v0.2.0"
   git push origin main
   ```

3. **태그 생성 후 push**
   ```bash
   git tag v0.2.0
   git push origin v0.2.0
   ```

4. **Release 워크플로 실행**
   - `v*` 태그가 push되면 **Release** 워크플로가 자동으로 돌고, 빌드 후 같은 버전의 Release에 파일이 붙음.

**또는** GitHub **Actions** 탭에서 **Release** 워크플로를 골라 **Run workflow**로 수동 실행할 수도 있습니다 (이때는 워크플로가 체크아웃한 버전으로 빌드).

---

## 방법 C: release 브랜치로 릴리스

1. **release 브랜치에 push**
   ```bash
   git checkout -b release   # 또는 기존 release 브랜치
   git push origin release
   ```

2. **Release 워크플로 실행**
   - `release` 브랜치 push만으로 **Release** 워크플로가 실행됨.
   - 이때는 **태그가 없으므로** tauri-action이 버전을 어떻게 잡는지(예: package.json 기준)에 따라 Release 제목/파일명이 정해짐.

---

## 한 줄 요약

- **“main만 push해서 릴리스하고 싶다”** → **방법 A**: main에 push → Bump Version이 버전 올리고 태그 push → Release가 빌드 후 GitHub Release에 올림.
- **“지금 버전을 내가 정하고 태그로 릴리스하고 싶다”** → **방법 B**: 버전 수정 후 커밋·push → `vX.Y.Z` 태그 push → Release가 그 태그로 빌드·업로드.
- **“release 브랜치로 빌드만 돌리고 싶다”** → **방법 C**: `release` 브랜치에 push.

---

## 같은 버전으로 다시 릴리스하기

잘못 올렸거나 같은 버전(v0.1.6 등)을 다시 빌드해서 올리고 싶을 때.

1. **GitHub에서 기존 Release 삭제**
   - 저장소 → **Releases** → 해당 버전(예: v0.1.6) 열기
   - **Delete this release** 로 Release만 삭제 (태그는 다음 단계에서 삭제)

2. **원격(remote) 태그 삭제**
   ```bash
   git push origin --delete v0.1.6
   ```

3. **(선택) 코드 수정**
   - 수정 후 `main`에 커밋·push
   - 다시 빌드할 커밋을 준비

4. **같은 버전 태그를 다시 만들고 push**
   ```bash
   git checkout main
   git pull origin main
   git tag v0.1.6
   git push origin v0.1.6
   ```
   - 특정 커밋에 태그를 걸려면: `git tag v0.1.6 <커밋해시>`

   **스크립트로 한 번에:** (1~2단계를 수동으로 한 뒤)
   ```bash
   ./scripts/re-release.sh v0.1.6
   ```
   원격 태그 삭제까지 스크립트에 맡기려면: `./scripts/re-release.sh v0.1.6 -d` (GitHub에서 Release 삭제는 먼저 필요).

5. **결과**
   - 태그가 새로 push되면 **Release** 워크플로가 다시 실행되고, 같은 버전(v0.1.6)으로 새 빌드가 GitHub Release에 올라갑니다.

**요약:** 기존 Release 삭제 → 원격 태그 삭제(`git push origin --delete v0.1.6`) → 같은 이름 태그 다시 만들어 push.

---

## 트리거 정리 (Release 워크플로)

- **태그 push:** `v1.0.0`, `v0.1.6` 등 `v*` 태그를 push하면 Release 실행.
- **release 브랜치 push:** `release` 브랜치에 push해도 Release 실행.
- **수동 실행:** Actions → Release → Run workflow.

Bump Version은 **main에 push할 때만** 돌고, 그 다음 **태그를 push**하는 방식으로 Release를 켭니다.
