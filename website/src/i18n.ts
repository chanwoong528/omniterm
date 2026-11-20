import type { FeatureScreenshotKey } from './screenshots';

export type Lang = 'ko' | 'en';

interface Feature {
  title: string;
  desc: string;
  /** 기능 스크린샷. 실제 파일과 가장자리 처리는 screenshots.ts에서 정한다. */
  image: FeatureScreenshotKey;
  alt: string;
}

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
    btnMac: 'macOS용 다운로드',
    btnMacArch: 'Apple Silicon (M1 이상)',
    btnWin: 'Windows용 다운로드',
    btnWinArch: '64비트 (x64)',
    intelPrompt: 'Intel Mac이라면',
    intelLabel: 'Intel용 다운로드',
    allReleases: '모든 릴리스 보기',
    // 640px 미만에서는 같은 창의 터미널 부분만 보인다. 두 이미지에 함께 보이는 내용(탭, 터미널 출력)을 앞에 둔다.
    screenshotAlt:
      '운영 서버 탭이 열린 OmniTerm 창. 터미널에 서비스 상태, 접근 로그, API 서비스 로그가 보이고, 넓은 화면에서는 저장된 세션 사이드바와 /home/deploy/app의 SFTP 파일 목록도 함께 보인다.',
    featuresTitle: '필요한 기능만, 제대로',
    featuresSub: '서버 작업 흐름을 끊는 도구 전환을 없앴습니다.',
    features: [
      {
        title: 'SSH 직접 / 바스천 접속',
        // ⁠(WORD JOINER): Chrome은 word-break: keep-all이어도 괄호 앞뒤에서 줄을 바꿔 "호스트)/을"로 끊는다.
        desc: '직접 접속은 물론 바스천⁠(점프 호스트)⁠을 거치는 접속까지 지원합니다. ProxyCommand 설정 없이 GUI에서 바로 구성하세요.',
        image: 'bastion',
        alt: 'Use Bastion (Jump Host)를 켠 세션 폼. 대상 서버 deploy@10.0.1.20에 ubuntu@bastion.example.com을 거쳐 접속하고, 두 서버에 각각 다른 개인 키를 지정했다.',
      },
      {
        title: '터미널 탭',
        desc: '여러 서버 세션을 탭으로 열어 한 창에서 오가며 작업할 수 있습니다. xterm.js 기반의 빠른 렌더링.',
        image: 'tabs',
        alt: '서버별 터미널 탭 세 개. 활성 탭인 스테이징 서버에서 git pull, 서비스 재시작, 헬스 체크 결과가 보인다.',
      },
      {
        title: 'SFTP 파일 탐색기',
        desc: '원격 파일을 탐색하고 드래그 앤 드롭으로 업로드하세요. 터미널 옆에 나란히 띄워 놓고 쓸 수 있습니다.',
        image: 'sftp',
        alt: '/home/deploy/app의 파일 크기와 수정일을 보여 주는 SFTP 패널. 파일 두 개가 업로드되는 중이고 "Drop files to upload" 안내가 보인다.',
      },
      {
        title: '키 매니저',
        // ⁠: Chrome은 keep-all이어도 가운뎃점 앞뒤에서 줄을 바꾼다. "등록·관리합니다"를 한 덩어리로 묶는다.
        desc: 'SSH 키를 앱 안에서 등록⁠·⁠관리합니다. 접속마다 키 경로를 찾아 헤맬 필요가 없습니다.',
        image: 'keys',
        alt: '개인 키 네 개(deploy_ed25519, bastion, staging_rsa, build-runner)가 등록된 Key Manager 탭',
      },
      {
        title: '세션 저장',
        desc: '접속 정보를 저장해 두고 클릭 한 번으로 다시 연결합니다. 자주 쓰는 서버 목록을 한눈에.',
        image: 'sessions',
        alt: '저장된 세션 목록. Production 폴더에 prod-api, db-replica(포트 포워딩 1개 실행 중), bastion이 있고, 그 아래에 staging-web과 build-runner가 있다.',
      },
      {
        title: 'macOS & Windows',
        desc: 'Tauri 기반 네이티브 앱으로 두 플랫폼에서 동일한 경험을 제공합니다. 가볍고 빠릅니다.',
        image: 'macos',
        alt: 'macOS에서 본 OmniTerm 창의 왼쪽 위. 빨강·노랑·초록 창 버튼과 타이틀 바, 저장된 세션 사이드바, 터미널 탭이 보인다.',
      },
    ] satisfies Feature[],
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
    btnMac: 'Download for macOS',
    btnMacArch: 'Apple Silicon (M1 or later)',
    btnWin: 'Download for Windows',
    btnWinArch: '64-bit (x64)',
    intelPrompt: 'On an Intel Mac?',
    intelLabel: 'Download for Intel',
    allReleases: 'View all releases',
    screenshotAlt:
      'OmniTerm window with a production server tab open. The terminal shows service status, access logs and the API service journal; on wider screens the saved-sessions sidebar and an SFTP list of /home/deploy/app appear alongside.',
    featuresTitle: 'Just the features you need, done right',
    featuresSub: 'No more tool-switching in the middle of server work.',
    features: [
      {
        title: 'Direct / bastion SSH',
        desc: 'Connect directly or through a bastion (jump host). Configure everything in the GUI — no ProxyCommand wrangling.',
        image: 'bastion',
        alt: 'Session form with "Use Bastion (Jump Host)" checked: deploy@10.0.1.20 is reached through ubuntu@bastion.example.com, and each host has its own private key.',
      },
      {
        title: 'Terminal tabs',
        desc: 'Open multiple server sessions as tabs and switch between them in one window. Fast rendering powered by xterm.js.',
        image: 'tabs',
        alt: 'Three terminal tabs, one per server. The active staging tab shows a git pull, a service restart and a health check.',
      },
      {
        title: 'SFTP file explorer',
        desc: 'Browse remote files and upload with drag & drop, side by side with your terminal.',
        image: 'sftp',
        alt: 'SFTP panel listing /home/deploy/app with sizes and dates, two files uploading, and a "Drop files to upload" hint.',
      },
      {
        title: 'Key manager',
        desc: 'Register and manage SSH keys inside the app. No more hunting for key paths on every connection.',
        image: 'keys',
        alt: 'Key Manager tab with four registered private keys: deploy_ed25519, bastion, staging_rsa and build-runner.',
      },
      {
        title: 'Saved sessions',
        desc: 'Save connection details and reconnect with a single click. Your frequently used servers, at a glance.',
        image: 'sessions',
        alt: 'Saved sessions: a Production folder holding prod-api, db-replica (one port forward running) and bastion, followed by staging-web and build-runner.',
      },
      {
        title: 'macOS & Windows',
        desc: 'A native Tauri app delivering the same experience on both platforms. Light and fast.',
        image: 'macos',
        alt: 'Top-left corner of the OmniTerm window on macOS: red, yellow and green window buttons, the title bar, the saved-sessions sidebar and terminal tabs.',
      },
    ] satisfies Feature[],
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
