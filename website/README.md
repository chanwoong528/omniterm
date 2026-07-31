# OmniTerm 랜딩 페이지

Astro + Tailwind CSS 기반 정적 사이트. `main` 브랜치에 `website/` 변경이 푸시되면
[deploy-website.yml](../.github/workflows/deploy-website.yml) 워크플로우가 GitHub Pages로 자동 배포합니다.

- 배포 주소: https://chanwoong528.github.io/omniterm

## 개발

```bash
cd website
npm install
npm run dev      # http://localhost:4321/omniterm
npm run build    # dist/ 에 정적 빌드
```

## 스크린샷 교체

실제 앱 스크린샷이 준비되면:

1. `public/screenshot.png` 로 저장
2. `src/pages/index.astro` 의 Screenshot 섹션에서 주석 처리된 `<img>` 태그로 mock UI를 교체

## 다운로드 버튼

버튼 링크는 페이지 로드 시 GitHub API(`releases/latest`)에서 최신 릴리스 파일을 찾아 연결됩니다.
API 실패 시 릴리스 페이지로 폴백합니다. 릴리스 파일명 패턴이 바뀌면
`index.astro` 하단 스크립트의 정규식을 수정하세요.
