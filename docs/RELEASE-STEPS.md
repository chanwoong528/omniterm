# GitHub Release 절차

설치 파일(DMG·EXE·MSI)을 빌드해 GitHub Release에 올리는 절차입니다. 영어 요약은 [README.md](../README.md)의 Releasing 절에 있고, 규칙의 원본은 [CLAUDE.md](../CLAUDE.md)의 "Releasing"·"Release notes" 절입니다.

---

## 한눈에 보기

| 워크플로 | 트리거 | 하는 일 |
|---|---|---|
| **Bump Version** (`.github/workflows/bump-version.yml`) | `main` push | 패치 버전을 올려 `chore: release vX.Y.Z [skip ci]`로 커밋하고 태그를 push합니다. push의 head 커밋 메시지에 `[skip ci]`가 있거나 `website/**`·`.github/**`만 바뀌었으면 건너뜁니다. |
| **Release** (`.github/workflows/release.yml`) | `v*` 태그 push, `release` 브랜치 push, 수동 실행 | macOS(Apple Silicon·Intel)와 Windows x64를 빌드해 GitHub Release에 올립니다. 태그 ref에서 돌 때는 `check` 잡이 태그 커밋 메시지를 읽고, `[skip release]`가 있으면 빌드를 건너뜁니다. |

주의할 점:

- **태그를 push해도 빌드가 시작되지 않습니다.** 릴리스 커밋에는 `[skip ci]`가 있어야 합니다(없으면 Bump Version이 버전을 한 번 더 올립니다). 그런데 GitHub은 태그 push에도 `[skip ci]`를 적용합니다. 그래서 빌드는 태그 ref에서 `gh workflow run release.yml --ref vX.Y.Z`로 직접 시작합니다. v0.2.1부터 모든 릴리스를 이렇게 빌드했습니다.
- **릴리스 커밋에 `[skip release]`를 넣으면 안 됩니다.** 태그 ref에서 수동으로 실행해도 `check` 잡은 태그 커밋을 읽기 때문에 빌드를 건너뜁니다.
- **Bump Version이 만든 태그도 빌드되지 않습니다.** 그 커밋에도 `[skip ci]`가 있고, 워크플로가 `GITHUB_TOKEN`으로 push한 태그는 다른 워크플로를 시작하지 않습니다. 이 태그로 설치 파일을 만들려면 아래 정식 릴리스의 5단계부터 하면 됩니다. 단, Bump Version은 `Cargo.lock`을 갱신하지 않습니다.
- **Release 이름과 태그는 git ref가 아니라 `tauri.conf.json`의 version에서 정해집니다**(`tagName: v__VERSION__`). 매니페스트 버전이 태그와 다르면 다른 버전의 Release에 올라갑니다.
- **문서만 고친 push에도 `[skip ci]`를 붙입니다.** `README.md`·`docs/**`·`CLAUDE.md`는 Bump Version의 제외 경로가 아니어서, 붙이지 않으면 버전과 태그가 하나 더 생깁니다.

---

## 정식 릴리스 (설치 파일까지)

목표 버전은 직접 정합니다. 0.2.2 → 0.3.1처럼 패치·마이너·메이저 올림이 아닌 값도 됩니다.

```bash
# 1. 기능 작업은 평소처럼 커밋하고, 아직 push하지 않습니다.
#    기능 커밋만 따로 push하면 Bump Version이 패치 버전을 올립니다.
#    3단계에서 릴리스 커밋과 함께 push하면 head 커밋의 [skip ci] 때문에 건너뜁니다.

# 2. 세 매니페스트에 같은 버전을 쓰고 lockfile 두 개를 다시 만듭니다.
#    package.json, src-tauri/tauri.conf.json, src-tauri/Cargo.toml
npm install --package-lock-only
(cd src-tauri && cargo check)   # Cargo.lock의 app 항목 갱신

# 3. 커밋 메시지에 [skip ci]는 넣고, [skip release]는 넣지 않습니다.
git add package.json package-lock.json src-tauri/tauri.conf.json \
        src-tauri/Cargo.toml src-tauri/Cargo.lock
git commit -m "chore: release vX.Y.Z [skip ci]"
git push origin main

# 4. 태그를 만들어 push합니다. 이것만으로는 빌드가 시작되지 않습니다.
git tag vX.Y.Z && git push origin vX.Y.Z

# 5. 태그 ref에서 빌드를 시작하고 끝날 때까지 기다립니다.
gh workflow run release.yml --ref vX.Y.Z
gh run list --workflow release.yml --limit 1   # 몇 초 뒤 run id 확인
gh run watch <run-id> --exit-status

# 6. 빌드가 성공한 뒤에 릴리스 노트를 교체합니다(아래 "릴리스 노트 교체" 참고).
```

웹에서 시작하려면 **Actions → Release → Run workflow**에서 **Use workflow from**을 **Tags**의 `vX.Y.Z`로 바꿉니다. 기본값인 `main`으로 실행하면 태그가 아니라 `main`의 HEAD가 빌드됩니다.

---

## 태그만 올리는 경우 (스크립트)

두 스크립트는 커밋에 `[skip ci] [skip release]`를 넣습니다. 그래서 스크립트가 만든 태그는 수동 실행으로도 빌드되지 않으니, 설치 파일이 필요할 때는 쓰지 않습니다. 스크립트는 끝에 "Actions → Release → Run workflow 로 수동 실행하세요"라고 출력하지만, 그대로 실행해도 `check` 잡에서 건너뜁니다.

| 명령 | 하는 일 |
|---|---|
| `npm run release:bump -- [patch\|minor\|major]`<br>(`scripts/bump-and-release.sh`, 기본값 `patch`) | `main` 브랜치에서만 실행됩니다. 세 매니페스트와 `package-lock.json`의 버전을 올리고(`Cargo.lock`은 그대로), `chore: release vX.Y.Z [skip ci] [skip release]`로 커밋한 뒤 `main`과 태그를 push합니다. |
| `npm run release:re -- <버전> [-d] [-y]`<br>(`scripts/re-release.sh`) | 같은 버전의 태그를 다시 붙입니다. 버전은 `v0.1.6`과 `0.1.6` 모두 받습니다. `git checkout main`과 `git pull`을 한 뒤 빈 커밋 `chore: re-release vX.Y.Z [skip ci] [skip release]`를 만들고, 태그를 붙여 `main`과 태그를 push합니다.<br>`-d`: 원격 태그를 먼저 지웁니다(GitHub Release를 지웠는지 묻습니다).<br>`-y`·`--yes`: 그 질문을 건너뜁니다.<br>`-d` 없이 실행했는데 원격에 같은 태그가 있으면 태그 push가 거부됩니다. |

`npm run`으로 옵션을 넘길 때는 `--`가 필요합니다. 없으면 npm이 `-d`·`-y`를 자기 옵션으로 처리합니다.

---

## 같은 버전 다시 빌드하기

**같은 커밋으로 다시 빌드할 때**(빌드 실패, 에셋 누락 등)는 태그를 그대로 두고 태그 ref에서 다시 실행합니다.

```bash
gh workflow run release.yml --ref vX.Y.Z
```

tauri-action은 기존 Release를 찾아서 이름이 같은 에셋만 지우고 다시 올립니다. 릴리스 노트는 그대로 남습니다.

**다른 커밋으로 같은 버전을 다시 낼 때**는 Release와 태그를 지우고 새 커밋에 태그를 다시 붙입니다. 새 커밋 메시지에도 `[skip release]`가 없어야 하고, 세 매니페스트의 버전이 `X.Y.Z`여야 합니다.

```bash
gh release delete vX.Y.Z --cleanup-tag --yes   # Release와 원격 태그 삭제
git tag -f vX.Y.Z <커밋>                         # <커밋>을 생략하면 HEAD
git push origin vX.Y.Z
gh workflow run release.yml --ref vX.Y.Z
```

Release를 지웠으니 빌드가 끝나면 릴리스 노트를 다시 올립니다. `re-release.sh`는 `[skip release]` 커밋에 태그를 붙이므로 이 경우에는 쓸 수 없습니다.

---

## 릴리스 노트 교체

`release.yml`의 `releaseBody`는 에셋 이름이 틀린 고정 문구입니다. 빌드가 끝나면 반드시 덮어씁니다. 전체 형식과 매번 붙이는 끝부분(다운로드 표, 서명 안내, Full changelog 링크)은 CLAUDE.md의 "Release notes" 절에 있습니다. 요점은 다음과 같습니다.

- **영어**로, v0.3.1·v0.3.2와 같은 형식으로 씁니다.
- 해당하는 절만 이 순서로 넣습니다: `## OmniTerm vX.Y.Z` → `### ✨ New` → `### 💅 Improved` → `### 🔧 Under the hood` → `### 📦 Downloads`.
- 항목마다 앞부분을 굵게 쓰고, 사용자가 이제 무엇을 할 수 있는지 먼저 씁니다. 포트·파일·버튼은 실제 이름으로 씁니다. 일부만 구현했다면 빠진 부분을 밝히고, 자동 마이그레이션이 있으면 적습니다.
- 에셋 이름은 `Omniterm_X.Y.Z_aarch64.dmg`처럼 `Omniterm`(t 소문자)입니다. 올리기 전에 실제 에셋 이름과 대조합니다.

```bash
gh release view vX.Y.Z --json assets -q '.assets[].name'   # 실제 에셋 이름
gh release edit vX.Y.Z --notes-file <file>
```

---

## 트리거 정리

| 상황 | Bump Version | Release |
|---|---|---|
| `main` push, head 커밋에 `[skip ci]` 없음 | 패치 버전 올림 + 태그 push | 시작 안 됨(Bump Version이 push한 태그) |
| `main` push, head 커밋에 `[skip ci]` 있음 | 건너뜀 | — |
| `main` push, `website/**`·`.github/**`만 변경 | 건너뜀 | — |
| `v*` 태그 push, 태그 커밋에 `[skip ci]` 있음(정상 릴리스 커밋) | — | 시작 안 됨 |
| `v*` 태그 push, 태그 커밋에 `[skip ci]` 없음 | — | 실행. 단 `[skip release]`가 있으면 `check`에서 건너뜀 |
| `gh workflow run release.yml --ref vX.Y.Z` | — | 실행. 단 태그 커밋에 `[skip release]`가 있으면 `check`에서 건너뜀 |
| `gh workflow run release.yml`(브랜치 ref, 기본값 `main`) | — | `check` 없이 그 브랜치의 HEAD를 빌드해 매니페스트 버전의 Release에 올림. Release가 있으면 에셋을 덮어쓰고, 없으면 HEAD에 태그를 만듦. 쓰지 않음 |
| `release` 브랜치 push | — | `check` 없이 빌드(v0.1.15에서 한 번 사용). 지금 절차에서는 쓰지 않음 |
