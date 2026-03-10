#!/usr/bin/env bash
# 같은 버전으로 다시 릴리스할 때 사용.
# 사용법: ./scripts/re-release.sh [버전] [옵션...]
#   버전: v0.1.6 또는 0.1.6
#   옵션: -d       원격 태그 삭제 후 재생성 (GitHub에서 Release는 먼저 수동 삭제 필요)
#         -y       확인 없이 원격 태그 삭제 (-d와 함께 사용 시 프롬프트 생략)
#
# 예: ./scripts/re-release.sh v0.1.6
# 예: ./scripts/re-release.sh 0.1.6 -d        # 원격 태그 삭제 (확인 후)
# 예: ./scripts/re-release.sh 0.1.6 -d -y    # 원격 태그 자동 삭제 후 재푸시

set -e

VERSION_RAW="${1:?Usage: $0 <version> [-d] [-y]}"
DELETE_REMOTE=false
AUTO_YES=false
for arg in "${@:2}"; do
  [[ "$arg" == "-d" ]] && DELETE_REMOTE=true
  [[ "$arg" == "-y" || "$arg" == "--yes" ]] && AUTO_YES=true
done

# v0.1.6 형태로 통일
if [[ "$VERSION_RAW" != v* ]]; then
  TAG="v${VERSION_RAW}"
else
  TAG="$VERSION_RAW"
fi

echo "=== 같은 버전으로 다시 릴리스: $TAG ==="

if [[ "$DELETE_REMOTE" == true ]]; then
  echo "원격 태그 삭제: $TAG"
  if [[ "$AUTO_YES" != true ]]; then
    read -p "GitHub에서 해당 Release는 이미 삭제하셨나요? (y/N) " -n 1 -r
    echo
    [[ $REPLY =~ ^[yY]$ ]] || { echo "취소됨. GitHub Releases에서 먼저 삭제 후 다시 실행하세요."; exit 1; }
  fi
  git push origin --delete "$TAG" || true
fi

echo "main 브랜치로 이동 및 최신화..."
git checkout main
git pull origin main

# 로컬에 같은 이름 태그가 있으면 제거 (원격만 삭제한 경우 등)
if git rev-parse "$TAG" >/dev/null 2>&1; then
  echo "로컬 태그 제거 후 재생성: $TAG"
  git tag -d "$TAG"
fi

# [skip release] 커밋을 만들어 태그를 붙이면 Release 워크플로가 자동으로 빌드하지 않음
echo "커밋 생성: re-release $TAG [skip release]"
git commit --allow-empty -m "chore: re-release $TAG [skip ci] [skip release]"

echo "태그 생성: $TAG"
git tag "$TAG"

echo "main 및 태그 push (Release 워크플로는 [skip release]로 빌드 생략)..."
git push origin main
git push origin "$TAG"

echo "완료. $TAG 푸시됨. 실제 릴리스 빌드는 Actions → Release → Run workflow 로 수동 실행하세요."
