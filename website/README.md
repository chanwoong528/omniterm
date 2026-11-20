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

## 스크린샷

랜딩의 대표 이미지(`hero`, 모바일용 `hero-mobile`)와 기능별 이미지(`feature-*`)는
`src/assets/screenshots/`의 2x PNG입니다. 빌드할 때 Astro가 AVIF·WebP와 srcset을 만듭니다.

- 앱의 실제 화면에 가짜 데모 데이터를 넣어 찍습니다. 다시 찍으려면 저장소 루트에서 `npm run shots`를 실행합니다.
- 데모 데이터와 장면을 고치는 방법은 [scripts/landing-shots/README.md](../scripts/landing-shots/README.md)에 있습니다.
- 어떤 기능 행에 어떤 이미지를 쓰는지는 `src/screenshots.ts`와 `src/i18n.ts`의 `features`에서 정합니다.

## 다운로드 버튼

버튼 링크는 페이지 로드 시 GitHub API(`releases/latest`)에서 최신 릴리스 파일을 찾아 연결됩니다.
API 실패 시 릴리스 페이지로 폴백합니다. 릴리스 파일명 패턴이 바뀌면
`src/components/Landing.astro` 하단 스크립트의 정규식을 수정하세요.
