# Step 5: SFTP 파일 브라우저 UI + 로직 연동 (완료)

## 구현 요약

### Rust (src-tauri)

**Command**

- `read_sftp_directory(session_id, path)`:
  - `SshSessionManager`에서 `session_id`로 target `ssh2::Session`을 가져옴
  - `session.sftp()`로 SFTP 핸들 생성
  - `readdir(path)`로 디렉토리 목록 조회
  - 반환: `Vec<SftpEntry> { name, path, is_dir, size?, mtime? }`

**오류**

- `SftpError`는 `{ kind, message }` 형태로 직렬화됩니다.

### Frontend

- `SftpExplorer`는 **현재 활성 터미널 탭의 sessionId**를 사용합니다.
- 기본 경로는 `.`(Home)로 시작합니다.
- 기능:
  - Refresh
  - Home / Root / Up (상위 폴더)
  - 폴더 클릭으로 하위 이동
  - 파일/폴더 리스트 + 파일 size 표시

## 사용 방법

1. Sessions 탭에서 서버에 Connect하여 터미널 탭을 엽니다.
2. Sidebar의 SFTP 탭으로 이동하면 자동으로 Home(`.`) 디렉토리를 로드합니다.
3. 폴더를 클릭해 이동하거나, Up / Root / Home / Refresh로 탐색합니다.

