# Step 3: SSH Direct + Bastion 터널링 (완료)

## 구현 요약

### Rust (src-tauri)

**의존성** (`Cargo.toml`): `ssh2 = "0.9"`, `uuid = "1.0"`

**SSH 모듈** (`src/ssh/`)

- **error.rs**: `SshConnectionError` (BastionConnectionFailed, BastionAuthFailed, TargetConnectionFailed, TargetAuthFailed, InvalidConfig) — Bastion vs Target 실패 구분
- **auth.rs**: `AuthMethod` (Password / PrivateKey), `AuthPayload` (password 또는 private_key_path)
- **direct.rs**: `connect_direct(host, port, username, auth)` — TCP 연결 → handshake → 인증
- **bastion.rs**: `connect_via_bastion(...)`  
  1) Bastion에 Direct로 SSH 연결  
  2) `channel_direct_tcpip(target_host, target_port)` 로 터널 생성  
  3) 로컬에서 `TcpListener` + `TcpStream::connect` 로 연결된 한 쌍의 스트림 생성  
  4) 스레드 2개: Channel ↔ 스트림 한쪽 끝으로 양방향 복사  
  5) 스트림 다른 쪽을 `Session::set_tcp_stream` + handshake + Target 인증  
  → 반환: `(Target Session, Bastion Session)` (Bastion Session 유지해야 터널 유지)
- **session_manager.rs**: `SshSessionManager` — `register(target, bastion?)` → `session_id` (UUID), `get_target_session(id)`, `has(id)`, `remove(id)`

**Command** (`src/commands/ssh_connection.rs`)

- `establish_ssh_connection(payload, manager)` (async)  
  - `EstablishSshConnectionPayload`: `target`, `useBastion`, `bastion?`  
  - 서버별: `host`, `port`, `username`, `authMethod` ("password" | "privateKey"), `password?`, `privateKeyPath?` (또는 `privateKeyId` → 경로는 나중에 store에서 조회 가능)
  - `spawn_blocking` 안에서 Direct 또는 Bastion 경로로 연결 후 `manager.register(...)` 해서 `session_id` 반환
  - UI 블로킹 방지를 위해 비동기 + `spawn_blocking` 사용

### Frontend

- **useEstablishConnection** (`src/domains/session/hooks/useEstablishConnection.ts`):  
  `establishConnection(target, useBastion, bastion?)` → `invoke('establish_ssh_connection', { payload })`,  
  키 매니저의 `registeredKeys`에서 `privateKeyId` → `storageKey`(경로)로 변환해 `privateKeyPath` 로 전달
- **Sidebar**: `handleConnect`에서 `establishConnection` 호출, `isConnecting` / `connectionError` 표시, 성공 시 `sessionId` 로그

## 사용 방법

1. **Direct**: Target만 입력, Use Bastion 해제 → `connect_direct`만 사용
2. **Bastion**: Use Bastion 체크 후 Bastion + Target 입력 → `connect_via_bastion` (Bastion 연결 → 터널 → Target 연결)
3. **Private Key**: Key Manager에 키(경로) 등록 후 세션 폼에서 해당 키 선택 → `privateKeyPath`로 전달 (또는 나중에 `privateKeyId`만 보내고 Rust Store에서 경로 조회)

## 로컬 테스트 (본인 컴퓨터로 접속)

Bastion 없이 **같은 Mac에서 SSH 서버가 켜져 있으면** 바로 테스트할 수 있습니다.

### 1. macOS에서 SSH(원격 로그인) 켜기

- **시스템 설정** → **일반** → **공유** → **원격 로그인** 켜기  
  또는 터미널에서:
  ```bash
  sudo systemsetup -setremotelogin on
  ```

### 2. 앱에서 입력

- **Host**: `127.0.0.1` (또는 `localhost`)
- **Port**: `22`
- **Username**: 현재 Mac 로그인 사용자명 (터미널에서 `whoami` 로 확인)
- **인증**: Password 선택 후 Mac 로그인 비밀번호 입력
- **Use Bastion**: 체크 해제

Connect 클릭 후 성공하면 콘솔에 `Connected, session id: ...` 가 찍힙니다. 실패 시 빨간색 에러 메시지가 폼 위에 표시됩니다.

### 3. Private Key로 테스트 (선택)

- Key Manager에서 **Add key** → Label: `로컬 테스트`, Path: `~/.ssh/id_rsa` (또는 본인 키 경로) 등록
- 세션 폼에서 인증을 **Private Key**로 선택 후 해당 키 선택 → Connect

---

## 다음 단계 (Step 4)

- `spawn_pty_process`, `write_to_terminal`, 터미널 출력 이벤트 연동 (xterm.js + PTY)
- 반환된 `activeSshSessionId`로 해당 세션에 PTY 붙이기
