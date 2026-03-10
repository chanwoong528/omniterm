#!/usr/bin/env bash
# 로컬에서 릴리스(프로덕션) 빌드를 실행하고 결과물 경로를 출력합니다.
# 사용법: ./scripts/build-release-local.sh

set -e

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "=== 릴리스 빌드 실행 중 ==="
if [[ "$(uname -s)" == "Darwin" ]]; then
  npm run tauri:build:local
else
  npm run tauri:build
fi

BUNDLE_DIR="$ROOT/src-tauri/target/release/bundle"
echo ""
echo "=== 빌드 결과물 ==="
if [[ -d "$BUNDLE_DIR" ]]; then
  find "$BUNDLE_DIR" -maxdepth 3 -type f \( -name "*.dmg" -o -name "*.app" -o -name "*.msi" -o -name "*.exe" \) 2>/dev/null | while read -r f; do
    echo "  $f"
  done
  # Show directory listing if no installers found (e.g. app is a directory)
  if [[ "$(uname -s)" == "Darwin" ]] && [[ -d "$BUNDLE_DIR/macos" ]]; then
    echo "  macOS 앱: $BUNDLE_DIR/macos/"
  fi
  if [[ -d "$BUNDLE_DIR/dmg" ]]; then
    echo "  DMG:       $BUNDLE_DIR/dmg/"
  fi
  if [[ -d "$BUNDLE_DIR/msi" ]]; then
    echo "  MSI:       $BUNDLE_DIR/msi/"
  fi
  if [[ -d "$BUNDLE_DIR/nsis" ]]; then
    echo "  NSIS:      $BUNDLE_DIR/nsis/"
  fi
else
  echo "  (bundle 디렉터리를 찾을 수 없음)"
fi
