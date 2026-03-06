# Step 4: xterm.js + Rust PTY 연동 (완료)

## 구현 요약

### Rust (src-tauri)

**의존성** (`Cargo.toml`): `base64 = "0.22"`

**터미널 모듈** (`src/terminal/`)

- **shell_channel.rs**
  - 기존 SSH 세션에서 `channel_session()` → `request_pty("xterm")` → `shell()` 로 원격 셸 채널 생성.
  - 전용 스레드에서 비블로킹 읽기 루프: 채널에서 읽은 데이터를 base64 인코딩 후 `terminal-output` 이벤트로 emit.
  - 같은 스레드에서 `mpsc::Receiver`로 전달된 입력을 채널에 write.
  - `Session::set_blocking(false)` 로 논블로킹 동작.
- **mod.rs**: `ShellWriteManager` — `session_id` → `mpsc::Sender<Vec<u8>>` 맵. `spawn_pty_process` 시 등록, `write_to_terminal` 시 사용.

**Commands** (`src/commands/terminal.rs`)

- `spawn_pty_process(session_id, ssh_manager, shell_manager, app)`: 세션 조회 → mpsc 채널 생성 → 셸 스레드 spawn → tx를 ShellWriteManager에 등록.
- `write_to_terminal(session_id, data: String)`: 해당 세션의 tx로 UTF-8 바이트 전송.

**이벤트**

- `terminal-output`: payload `{ session_id, data? }` (정상 출력, base64) 또는 `{ session_id, error? }` (에러).

### Frontend

- **@xterm/xterm**, **@xterm/addon-fit** 설치.
- **TerminalView** (`src/components/terminal/TerminalView.tsx`): xterm 인스턴스 + FitAddon, `terminal-output` 이벤트 구독 후 base64 디코딩하여 터미널에 write. 키 입력은 `write_to_terminal` invoke.
- **terminalStore** (`src/stores/terminalStore.ts`): 탭 목록(`tabs`) 및 활성 탭(`activeTabId`), `addTab(sessionId, title)`, `removeTab`, `setActiveTab`.
- **MainArea**: 탭 바 + 탭별 `TerminalView`. 탭이 없으면 “Connect to a server…” 플레이스홀더.
- **Sidebar**: 연결 성공 시 `addTab(sessionId, title)` 후 `spawn_pty_process(sessionId)` 호출.

## 사용 방법

1. 사이드바에서 Target(및 선택 시 Bastion) 입력 후 Connect.
2. 연결 성공 시 메인 영역에 터미널 탭이 열리고, 원격 셸 출력이 표시됨.
3. 탭 클릭으로 전환, X로 탭 닫기. 창 리사이즈 시 활성 탭만 fit.

## 다음 단계 (Step 5)

- SFTP 파일 브라우저 UI 및 `read_sftp_directory` 로직 연동.
