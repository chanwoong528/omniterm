# Step 1: Vite + React + Tauri v2 스캐폴딩 및 프로젝트 구조

## 실행한 스캐폴딩 명령어

비대화형 환경에서는 `create-tauri-app`이 터미널 입력을 요구하므로, 아래 순서로 **수동 스캐폴딩**을 수행했습니다.

### 1. Vite + React + TypeScript 프로젝트 생성

```bash
cd /path/to/OmniTerm
npm create vite@latest . -- --template react-ts
npm install
```

### 2. Tauri CLI 설치 및 초기화

```bash
npm install -D @tauri-apps/cli@latest
CI=1 npx tauri init --ci \
  -A "OmniTerm" \
  -W "OmniTerm" \
  -D "../dist" \
  -P "http://localhost:5173" \
  --before-dev-command "npm run dev" \
  --before-build-command "npm run build"
```

### 3. 프론트엔드 의존성 추가

```bash
npm install @tauri-apps/api zustand lucide-react
npm install -D tailwindcss @tailwindcss/vite
```

### 4. 대화형으로 새 프로젝트를 만드는 경우 (참고)

기존 폴더가 비어 있고 터미널에서 대화형으로 진행할 수 있다면:

```bash
# 방법 A: create-tauri-app (프로젝트명으로 새 폴더 생성)
npm create tauri-app@latest OmniTerm -- --template react-ts --manager npm

# 방법 B: 현재 디렉토리에 생성
npm create tauri-app@latest . -- --template react-ts --manager npm
```

이후:

```bash
cd OmniTerm   # 방법 A인 경우
npm install
npm run tauri dev
```

---

## 전체 프로젝트 디렉토리 구조 (MVP 목표)

```
OmniTerm/
├── docs/
│   └── STEP1-SCAFFOLDING.md          # 본 문서
├── src/                              # React 프론트엔드
│   ├── main.tsx
│   ├── App.tsx
│   ├── index.css
│   ├── assets/
│   ├── components/                   # 공통 UI 컴포넌트
│   │   ├── ui/                       # 버튼, 입력, 모달 등
│   │   └── layout/
│   │       ├── TitleBar.tsx          # Frameless 윈도우용 트래픽 라이트
│   │       ├── Sidebar.tsx
│   │       └── MainArea.tsx
│   ├── domains/
│   │   ├── session/                  # SSH 세션 도메인
│   │   │   ├── components/
│   │   │   │   ├── SessionForm.tsx   # 세션 생성 폼 (Bastion 토글 포함)
│   │   │   │   └── SessionList.tsx
│   │   │   ├── hooks/
│   │   │   │   └── useSessionConnection.ts
│   │   │   └── types.ts
│   │   ├── key-manager/              # 키 매니저 도메인
│   │   │   ├── components/
│   │   │   │   ├── KeyManagerPanel.tsx
│   │   │   │   └── KeyRegistrationForm.tsx
│   │   │   ├── hooks/
│   │   │   │   └── useKeyManager.ts
│   │   │   └── types.ts
│   │   ├── terminal/                # 터미널 탭/PTY 도메인
│   │   │   ├── components/
│   │   │   │   ├── TerminalTabs.tsx
│   │   │   │   └── TerminalView.tsx  # xterm.js + fit
│   │   │   ├── hooks/
│   │   │   │   └── useTerminalSession.ts
│   │   │   └── types.ts
│   │   └── sftp/                     # SFTP 파일 탐색 도메인
│   │       ├── components/
│   │       │   ├── SftpExplorer.tsx
│   │       │   └── FileTree.tsx
│   │       ├── hooks/
│   │       │   └── useSftpDirectory.ts
│   │       └── types.ts
│   ├── stores/                       # Zustand 스토어
│   │   ├── sessionStore.ts
│   │   ├── keyManagerStore.ts        # 키 목록 메타데이터만 (평문 키 비보관)
│   │   └── terminalStore.ts
│   ├── hooks/                        # 공통 훅
│   └── types/                        # 전역 타입
├── src-tauri/                        # Rust 백엔드
│   ├── Cargo.toml
│   ├── tauri.conf.json
│   ├── build.rs
│   ├── capabilities/
│   │   └── default.json              # Command 권한 정의
│   ├── src/
│   │   ├── main.rs
│   │   ├── lib.rs
│   │   ├── commands/                 # Tauri Command 모듈
│   │   │   ├── mod.rs
│   │   │   ├── ssh_keys.rs           # manage_ssh_keys
│   │   │   ├── ssh_connection.rs     # establish_ssh_connection (Direct + Bastion)
│   │   │   ├── pty.rs                # spawn_pty_process, write_to_terminal
│   │   │   └── sftp.rs               # read_sftp_directory
│   │   ├── ssh/                      # SSH/터널링 로직
│   │   │   ├── mod.rs
│   │   │   ├── direct.rs             # Direct 접속
│   │   │   ├── bastion.rs            # Bastion 터널링 (channel_direct_tcpip)
│   │   │   └── session_manager.rs    # activeSshSessionId 관리
│   │   ├── pty/
│   │   │   ├── mod.rs
│   │   │   └── process.rs            # portable-pty 연동
│   │   └── store/                    # tauri-plugin-store 연동 (키 메타/경로)
│   │       └── mod.rs
│   └── icons/
├── index.html
├── package.json
├── tsconfig.json
├── tsconfig.app.json
├── tsconfig.node.json
├── vite.config.ts
├── eslint.config.js
└── README.md
```

---

## 현재 상태 요약

| 항목 | 상태 |
|------|------|
| Vite + React + TypeScript | ✅ 생성됨 |
| Tauri v2 (src-tauri) | ✅ `tauri init` 완료 |
| Tailwind CSS | ✅ @tailwindcss/vite 적용 |
| Zustand, Lucide React, @tauri-apps/api | ✅ 설치됨 |
| npm scripts: `tauri`, `tauri:dev`, `tauri:build` | ✅ 추가됨 |
| domains/, commands/, ssh/, pty/ 등 폴더 | Step 2~5에서 단계별 생성 예정 |

---

## 다음 단계 (Step 2)

- Frameless 윈도우 + 커스텀 타이틀바(트래픽 라이트) 설정
- Key Manager 패널 및 세션 생성 폼(Bastion 설정 토글, Private Key 드롭다운) UI 뼈대 구현
- 좌측 사이드바 + 우측 메인 영역 레이아웃 구성

개발 서버 실행:

```bash
npm run tauri:dev
```
