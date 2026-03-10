#!/usr/bin/env bash
# 버전을 올리고 main에 푸시한 뒤 태그를 푸시해 Release 워크플로를 실행합니다.
# 사용법: ./scripts/bump-and-release.sh [patch|minor|major]
#   patch (기본): 0.1.5 → 0.1.6
#   minor:        0.1.5 → 0.2.0
#   major:        0.1.5 → 1.0.0
#
# 예: ./scripts/bump-and-release.sh
# 예: ./scripts/bump-and-release.sh minor

set -e

BUMP="${1:-patch}"
if [[ "$BUMP" != "patch" && "$BUMP" != "minor" && "$BUMP" != "major" ]]; then
  echo "Usage: $0 [patch|minor|major]"
  exit 1
fi

# 현재 버전 (package.json)
CURRENT=$(node -p "require('./package.json').version")
# 새 버전
NEW_VERSION=$(node -e "
  const [a, b, c] = '$CURRENT'.split('.').map(Number);
  if ('$BUMP' === 'major') console.log([a + 1, 0, 0].join('.'));
  else if ('$BUMP' === 'minor') console.log([a, b + 1, 0].join('.'));
  else console.log([a, b, (c || 0) + 1].join('.'));
")

TAG="v${NEW_VERSION}"
echo "=== Bump & Release: $CURRENT → $NEW_VERSION ($BUMP) ==="

BRANCH=$(git rev-parse --abbrev-ref HEAD)
if [[ "$BRANCH" != "main" ]]; then
  echo "현재 브랜치가 main이 아닙니다: $BRANCH. main으로 체크아웃 후 실행하세요."
  exit 1
fi

# package.json
node -e "
  const fs = require('fs');
  const p = require('./package.json');
  p.version = '$NEW_VERSION';
  fs.writeFileSync('package.json', JSON.stringify(p, null, 2) + '\n');
"

# tauri.conf.json
node -e "
  const fs = require('fs');
  const path = 'src-tauri/tauri.conf.json';
  const c = JSON.parse(fs.readFileSync(path, 'utf8'));
  c.version = '$NEW_VERSION';
  fs.writeFileSync(path, JSON.stringify(c, null, 2) + '\n');
"

# Cargo.toml (package.version만 변경)
sed -i.bak 's/^version = .*/version = "'"$NEW_VERSION"'"/' src-tauri/Cargo.toml
rm -f src-tauri/Cargo.toml.bak

# package-lock.json
npm install --package-lock-only

# 커밋 & main 푸시 ([skip ci]로 Bump Version, [skip release]로 Release 워크플로 자동 실행 방지)
git add package.json package-lock.json src-tauri/tauri.conf.json src-tauri/Cargo.toml
git diff --staged --quiet && { echo "Nothing to commit (version unchanged?)."; exit 1; }
git commit -m "chore: release $TAG [skip ci] [skip release]"
git push origin main

# 태그 생성 & 푸시 (태그에 [skip release] 커밋을 가리키므로 Release 워크플로는 빌드 생략)
git tag "$TAG"
git push origin "$TAG"

echo "완료. $TAG 푸시됨. 실제 릴리스 빌드는 Actions → Release → Run workflow 로 수동 실행하세요."
