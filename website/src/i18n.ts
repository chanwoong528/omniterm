export type Lang = 'ko' | 'en';

export const translations = {
  ko: {
    title: 'OmniTerm — 통합 터미널 & SFTP 클라이언트',
    description:
      'macOS와 Windows를 위한 통합 터미널 & SFTP 클라이언트. SSH 직접/바스천 접속, 터미널 탭, 드래그 앤 드롭 SFTP, 키 매니저, 세션 저장.',
    navFeatures: '기능',
    navDownload: '다운로드',
    badgeLatest: '최신 버전',
    badgeSuffix: '무료 · 오픈 배포',
    heroLine: '서버 작업의 모든 것,',
    heroGradient: '터미널 하나로.',
    heroSub:
      'OmniTerm은 macOS와 Windows를 위한 통합 터미널 & SFTP 클라이언트입니다. SSH 접속, 파일 전송, 키 관리를 하나의 앱에서 해결하세요.',
    btnMac: ' macOS용 다운로드',
    btnWin: '🪟 Windows용 다운로드',
    intelLabel: 'Intel Mac용 다운로드',
    allReleases: '모든 릴리스 보기',
    screenshotAlt: 'OmniTerm 스크린샷 — 세션 사이드바, SFTP 탐색기, 접속된 터미널',
    featuresTitle: '필요한 기능만, 제대로',
    featuresSub: '서버 작업 흐름을 끊는 도구 전환을 없앴습니다.',
    features: [
      {
        icon: '🔐',
        title: 'SSH 직접 / 바스천 접속',
        desc: '직접 접속은 물론 바스천(점프 호스트)을 거치는 접속까지 지원합니다. ProxyCommand 설정 없이 GUI에서 바로 구성하세요.',
      },
      {
        icon: '🗂️',
        title: '터미널 탭',
        desc: '여러 서버 세션을 탭으로 열어 한 창에서 오가며 작업할 수 있습니다. xterm.js 기반의 빠른 렌더링.',
      },
      {
        icon: '📁',
        title: 'SFTP 파일 탐색기',
        desc: '원격 파일을 탐색하고 드래그 앤 드롭으로 업로드하세요. 터미널 옆에 나란히 띄워 놓고 쓸 수 있습니다.',
      },
      {
        icon: '🔑',
        title: '키 매니저',
        desc: 'SSH 키를 앱 안에서 등록·관리합니다. 접속마다 키 경로를 찾아 헤맬 필요가 없습니다.',
      },
      {
        icon: '💾',
        title: '세션 저장',
        desc: '접속 정보를 저장해 두고 클릭 한 번으로 다시 연결합니다. 자주 쓰는 서버 목록을 한눈에.',
      },
      {
        icon: '🖥️',
        title: 'macOS & Windows',
        desc: 'Tauri 기반 네이티브 앱으로 두 플랫폼에서 동일한 경험을 제공합니다. 가볍고 빠릅니다.',
      },
    ],
    installTitle: '설치 시 보안 경고가 나오나요?',
    installBody:
      'OmniTerm은 아직 코드 서명이 되어 있지 않아, 처음 실행할 때 운영체제 보안 경고가 표시될 수 있습니다. 앱이 손상되었거나 위험한 것이 아니라, 인터넷에서 받은 미서명 앱에 대한 기본 정책입니다.',
    installMacPre: '— "손상되었기 때문에 열 수 없습니다" 경고가 뜨면 터미널에서',
    installMacPost: '실행 후 다시 여세요.',
    installMacLink: '자세한 안내',
    installWinPre: '— "PC를 보호했습니다" 화면에서',
    installWinStrong: '추가 정보 → 실행',
    installWinPost: '을 선택하면 됩니다.',
    footerMade: 'OmniTerm — Tauri · React · Rust로 만들었습니다.',
    footerGithub: 'GitHub에서 보기',
  },
  en: {
    title: 'OmniTerm — Unified Terminal & SFTP Client',
    description:
      'A unified terminal & SFTP client for macOS and Windows. Direct/bastion SSH, terminal tabs, drag-and-drop SFTP, key manager, saved sessions.',
    navFeatures: 'Features',
    navDownload: 'Download',
    badgeLatest: 'Latest release',
    badgeSuffix: 'Free · Open distribution',
    heroLine: 'All your server work,',
    heroGradient: 'in one terminal.',
    heroSub:
      'OmniTerm is a unified terminal & SFTP client for macOS and Windows. SSH connections, file transfers, and key management — all in one app.',
    btnMac: ' Download for macOS',
    btnWin: '🪟 Download for Windows',
    intelLabel: 'Download for Intel Mac',
    allReleases: 'View all releases',
    screenshotAlt: 'OmniTerm screenshot — session sidebar, SFTP explorer, and a connected terminal',
    featuresTitle: 'Just the features you need, done right',
    featuresSub: 'No more tool-switching in the middle of server work.',
    features: [
      {
        icon: '🔐',
        title: 'Direct / bastion SSH',
        desc: 'Connect directly or through a bastion (jump host). Configure everything in the GUI — no ProxyCommand wrangling.',
      },
      {
        icon: '🗂️',
        title: 'Terminal tabs',
        desc: 'Open multiple server sessions as tabs and switch between them in one window. Fast rendering powered by xterm.js.',
      },
      {
        icon: '📁',
        title: 'SFTP file explorer',
        desc: 'Browse remote files and upload with drag & drop, side by side with your terminal.',
      },
      {
        icon: '🔑',
        title: 'Key manager',
        desc: 'Register and manage SSH keys inside the app. No more hunting for key paths on every connection.',
      },
      {
        icon: '💾',
        title: 'Saved sessions',
        desc: 'Save connection details and reconnect with a single click. Your frequently used servers, at a glance.',
      },
      {
        icon: '🖥️',
        title: 'macOS & Windows',
        desc: 'A native Tauri app delivering the same experience on both platforms. Light and fast.',
      },
    ],
    installTitle: 'Seeing a security warning during install?',
    installBody:
      'OmniTerm is not code-signed yet, so your OS may show a security warning on first launch. The app is not damaged or dangerous — this is the default policy for unsigned apps downloaded from the internet.',
    installMacPre: '— if you see a "damaged and can’t be opened" warning, run',
    installMacPost: 'in Terminal, then open the app again.',
    installMacLink: 'Detailed guide',
    installWinPre: '— on the "Windows protected your PC" screen, choose',
    installWinStrong: 'More info → Run anyway',
    installWinPost: '.',
    footerMade: 'OmniTerm — built with Tauri · React · Rust.',
    footerGithub: 'View on GitHub',
  },
} satisfies Record<Lang, unknown>;
