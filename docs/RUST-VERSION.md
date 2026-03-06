# Rust 버전 요구사항 (Rust 1.85+)

Tauri v2와 그 의존성(uuid → getrandom 0.4)이 **Rust 2024 edition**을 사용하므로, **Rust 1.85 이상**이 필요합니다.

현재 `cargo 1.84.0` 환경에서는 아래와 같은 오류가 발생합니다:

```
error: failed to parse manifest at `.../getrandom-0.4.2/Cargo.toml`
  feature `edition2024` is required
  The package requires the Cargo feature called `edition2024`, but that feature is not stabilized in this version of Cargo (1.84.0).
```

## 해결 방법

### 1. rustup 사용 중인 경우

```bash
rustup update
cargo --version   # 1.85 이상인지 확인
```

`rustup`이 PATH에 없으면 다음으로 설치 후 업데이트할 수 있습니다:

```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
source "$HOME/.cargo/env"
rustup update
```

### 2. Homebrew로 Rust를 설치한 경우

```bash
brew upgrade rust
# 또는 최신 rustup 기반 설치로 전환
brew install rustup-init
rustup-init
```

### 3. 공식 설치 스크립트로 rustup 설치

- https://rustup.rs 에서 안내에 따라 설치
- 설치 후 터미널을 다시 열고 `rustup update` 실행

---

업그레이드 후 프로젝트 루트에서:

```bash
npm run tauri:dev
```

으로 앱을 실행할 수 있습니다.
