#!/usr/bin/env bash
# 같은 버전으로 다시 릴리스할 때 사용.
# 사용법: ./scripts/re-release.sh [버전] [옵션]
#   버전: v0.1.6 또는 0.1.6
#   옵션: -d  원격 태그 삭제 후 재생성 (GitHub에서 Release는 먼저 수동 삭제 필요)
#
# 예: ./scripts/re-release.sh v0.1.6
# 예: ./scripts/re-release.sh 0.1.6 -d   # 원격 태그 삭제 후 재푸시

set -e

VERSION_RAW="${1:?Usage: $0 <version> [-d]}"
DELETE_REMOTE=false
[[ "${2:-}" == "-d" ]] && DELETE_REMOTE=true

# v0.1.6 형태로 통일
if [[ "$VERSION_RAW" != v* ]]; then
  TAG="v${VERSION_RAW}"
else
  TAG="$VERSION_RAW"
fi

echo "=== 같은 버전으로 다시 릴리스: $TAG ==="

if [[ "$DELETE_REMOTE" == true ]]; then
  echo "원격 태그 삭제: $TAG"
  read -p "GitHub에서 해당 Release는 이미 삭제하셨나요? (y/N) " -n 1 -r
  echo
  [[ $REPLY =~ ^[yY]$ ]] || { echo "취소됨. GitHub Releases에서 먼저 삭제 후 다시 실행하세요."; exit 1; }
  git push origin --delete "$TAG" || true
fi

echo "main 브랜치로 이동 및 최신화..."
git checkout main
git pull origin main

echo "태그 생성: $TAG"
git tag "$TAG"

echo "태그 push (Release 워크플로 자동 실행)..."
git push origin "$TAG"

echo "완료. GitHub Actions에서 Release 워크플로 진행 상황을 확인하세요."
