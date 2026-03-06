# Step 2: 세션 생성 UI 및 전체 레이아웃 뼈대 (완료)

## 구현 내용

### 1. Frameless 윈도우 + 커스텀 타이틀바
- **tauri.conf.json**: `decorations: false`로 네이티브 타이틀바 제거, 창 크기 1200×760
- **TitleBar** (`src/components/layout/TitleBar.tsx`): macOS 스타일 트래픽 라이트(닫기/최소화/최대화), `getCurrentWindow().close/minimize/toggleMaximize` 연동, `data-tauri-drag-region`으로 드래그 영역 지정

### 2. 전체 레이아웃 (다크 모드)
- **App**: 상단 TitleBar + 하단 좌측 Sidebar + 우측 MainArea
- **Sidebar**: 탭 3개 — **Sessions** | **Key Manager** | **SFTP**
- **MainArea**: 터미널 탭/뷰 플레이스홀더 (Step 4에서 xterm.js 연동)

### 3. 세션 생성 폼 (Sessions 탭)
- **SessionForm**: Target Server (Host, Port, Username), 인증 방식(Password / Private Key)
- **Bastion (Jump Host) 토글**: 체크 시 Bastion Server 필드 표시 (Host, Port, Username, 동일 인증 방식)
- Private Key 선택 시 **Key Manager에 등록된 키** 드롭다운에서 선택
- Connect 버튼 → Step 3에서 `establish_ssh_connection` 연동 예정

### 4. Key Manager (키 매니저)
- **KeyManagerPanel**: 등록된 키 목록, "Add key"로 라벨 + 경로(예: `~/.ssh/id_rsa`, `.pem`) 입력 후 목록에 추가
- 목록은 **메타데이터만** Zustand에 보관 (평문 키 내용은 저장하지 않음, Step 3에서 Rust Store 연동)

### 5. 기타
- **SessionList**: 저장된 SSH 세션 목록, 선택/삭제 (실제 저장은 Step 3 연동 시)
- **SftpExplorer**: 플레이스홀더 문구 (Step 5에서 파일 트리 연동)

## 파일 구조 (Step 2에서 추가/수정)

```
src/
├── App.tsx                          # TitleBar + Sidebar + MainArea
├── index.css                        # body overflow hidden
├── components/layout/
│   ├── TitleBar.tsx
│   ├── Sidebar.tsx
│   └── MainArea.tsx
├── domains/session/
│   ├── types.ts
│   └── components/
│       ├── SessionForm.tsx
│       └── SessionList.tsx
├── domains/key-manager/
│   ├── types.ts
│   └── components/
│       └── KeyManagerPanel.tsx
├── domains/sftp/components/
│   └── SftpExplorer.tsx
├── stores/
│   ├── sessionStore.ts
│   └── keyManagerStore.ts
└── types/
    ├── session.ts
    └── key-manager.ts
```

## 다음 단계 (Step 3)

- Rust: `manage_ssh_keys`, `establish_ssh_connection` (Direct + Bastion 터널링) 구현
- 프론트: Connect 클릭 시 Tauri Command 호출, `activeSshSessionId` 수신 및 세션 목록 반영
