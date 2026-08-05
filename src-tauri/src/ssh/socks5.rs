//! SOCKS5 서버 측 핸드셰이크 (dynamic forwarding, `ssh -D`).
//!
//! 포워딩 이벤트 루프는 한 스레드가 모든 커넥션을 논블로킹으로 돌린다.
//! 따라서 핸드셰이크도 블로킹 read/write로 짤 수 없고, 바이트가 도착하는
//! 대로 조금씩 진행하는 상태 기계여야 한다. RFC 1928의 CONNECT만 지원한다.

use std::io::{ErrorKind, Read, Write};
use std::net::{Ipv4Addr, Ipv6Addr, Shutdown, TcpStream};
use std::time::{Duration, Instant};

const SOCKS_VERSION: u8 = 0x05;
const NO_AUTH: u8 = 0x00;
const NO_ACCEPTABLE_METHOD: u8 = 0xFF;
const CMD_CONNECT: u8 = 0x01;
const ATYP_IPV4: u8 = 0x01;
const ATYP_DOMAIN: u8 = 0x03;
const ATYP_IPV6: u8 = 0x04;

pub const REPLY_SUCCESS: u8 = 0x00;
pub const REPLY_HOST_UNREACHABLE: u8 = 0x04;
pub const REPLY_CONNECTION_REFUSED: u8 = 0x05;
const REPLY_COMMAND_NOT_SUPPORTED: u8 = 0x07;
const REPLY_ADDRESS_TYPE_NOT_SUPPORTED: u8 = 0x08;

/// 클라이언트가 연결만 하고 아무것도 보내지 않는 경우를 정리한다.
const HANDSHAKE_TIMEOUT: Duration = Duration::from_secs(10);
/// SOCKS5 요청은 최대 262바이트다. 그보다 크면 SOCKS 클라이언트가 아니다.
const MAX_REQUEST_BYTES: usize = 512;
/// 실패 응답을 흘려보내기 위한 짧은 블로킹 쓰기 한도.
const ERROR_REPLY_TIMEOUT: Duration = Duration::from_millis(200);

#[derive(Debug, PartialEq, Eq)]
enum Stage {
    Greeting,
    Request,
    Done,
}

/// 핸드셰이크 한 건의 진행 상태.
pub struct SocksHandshake {
    pub stream: TcpStream,
    stage: Stage,
    read_buf: Vec<u8>,
    write_buf: Vec<u8>,
    started: Instant,
}

/// 한 번 진행시킨 결과.
pub enum HandshakeProgress {
    /// 아직 바이트가 더 필요하다.
    Pending,
    /// 목적지가 확정됐다. 호출 측이 채널을 열고 `success_reply`를 응답 버퍼에 넣는다.
    Connect { host: String, port: u16 },
    /// 이 커넥션은 버려야 한다 (프로토콜 위반, 타임아웃, 소켓 종료).
    Failed(&'static str),
}

impl SocksHandshake {
    pub fn new(stream: TcpStream) -> Self {
        Self {
            stream,
            stage: Stage::Greeting,
            read_buf: Vec::new(),
            write_buf: Vec::new(),
            started: Instant::now(),
        }
    }

    /// 논블로킹으로 읽고/쓰고 파싱을 한 단계 진행한다.
    pub fn progress(&mut self) -> HandshakeProgress {
        if self.started.elapsed() > HANDSHAKE_TIMEOUT {
            return HandshakeProgress::Failed("SOCKS handshake timed out");
        }
        if self.drain_write_buf().is_err() {
            return HandshakeProgress::Failed("SOCKS client disconnected");
        }

        let mut buf = [0u8; 512];
        match self.stream.read(&mut buf) {
            Ok(0) => return HandshakeProgress::Failed("SOCKS client closed the connection"),
            Ok(n) => self.read_buf.extend_from_slice(&buf[..n]),
            Err(e) if e.kind() == ErrorKind::WouldBlock => {}
            Err(_) => return HandshakeProgress::Failed("SOCKS client read failed"),
        }
        if self.read_buf.len() > MAX_REQUEST_BYTES {
            return HandshakeProgress::Failed("Not a SOCKS5 client");
        }

        match self.stage {
            Stage::Greeting => self.parse_greeting(),
            Stage::Request => self.parse_request(),
            Stage::Done => HandshakeProgress::Pending,
        }
    }

    /// VER | NMETHODS | METHODS...
    fn parse_greeting(&mut self) -> HandshakeProgress {
        if self.read_buf.len() < 2 {
            return HandshakeProgress::Pending;
        }
        if self.read_buf[0] != SOCKS_VERSION {
            return HandshakeProgress::Failed("Only SOCKS5 is supported");
        }
        let method_count = self.read_buf[1] as usize;
        if self.read_buf.len() < 2 + method_count {
            return HandshakeProgress::Pending;
        }
        let offers_no_auth = self.read_buf[2..2 + method_count].contains(&NO_AUTH);
        self.read_buf.drain(..2 + method_count);

        if !offers_no_auth {
            // 인증을 요구하는 클라이언트는 거절한다 — 터널 자체가 이미 SSH로
            // 인증되어 있고, 리스너는 기본적으로 loopback에만 열린다.
            self.write_buf
                .extend_from_slice(&[SOCKS_VERSION, NO_ACCEPTABLE_METHOD]);
            let _ = self.drain_write_buf();
            return HandshakeProgress::Failed("SOCKS client requires authentication");
        }

        self.write_buf.extend_from_slice(&[SOCKS_VERSION, NO_AUTH]);
        self.stage = Stage::Request;
        if self.drain_write_buf().is_err() {
            return HandshakeProgress::Failed("SOCKS client disconnected");
        }
        self.parse_request()
    }

    /// VER | CMD | RSV | ATYP | DST.ADDR | DST.PORT
    fn parse_request(&mut self) -> HandshakeProgress {
        if self.read_buf.len() < 4 {
            return HandshakeProgress::Pending;
        }
        if self.read_buf[0] != SOCKS_VERSION {
            return HandshakeProgress::Failed("Only SOCKS5 is supported");
        }
        if self.read_buf[1] != CMD_CONNECT {
            self.reply_error(REPLY_COMMAND_NOT_SUPPORTED);
            return HandshakeProgress::Failed("Only the SOCKS5 CONNECT command is supported");
        }

        let atyp = self.read_buf[3];
        // ATYP별 주소 길이. 도메인은 첫 바이트가 길이라 한 바이트를 더 봐야 한다.
        let address_len = match atyp {
            ATYP_IPV4 => 4,
            ATYP_IPV6 => 16,
            ATYP_DOMAIN => match self.read_buf.get(4) {
                Some(&len) => 1 + len as usize,
                None => return HandshakeProgress::Pending,
            },
            _ => {
                self.reply_error(REPLY_ADDRESS_TYPE_NOT_SUPPORTED);
                return HandshakeProgress::Failed("Unsupported SOCKS5 address type");
            }
        };

        let total_len = 4 + address_len + 2;
        if self.read_buf.len() < total_len {
            return HandshakeProgress::Pending;
        }

        let address = &self.read_buf[4..4 + address_len];
        let host = match atyp {
            ATYP_IPV4 => Ipv4Addr::new(address[0], address[1], address[2], address[3]).to_string(),
            ATYP_IPV6 => {
                let mut octets = [0u8; 16];
                octets.copy_from_slice(address);
                Ipv6Addr::from(octets).to_string()
            }
            _ => match std::str::from_utf8(&address[1..]) {
                Ok(name) => name.to_string(),
                Err(_) => {
                    self.reply_error(REPLY_ADDRESS_TYPE_NOT_SUPPORTED);
                    return HandshakeProgress::Failed("SOCKS5 hostname is not valid UTF-8");
                }
            },
        };
        let port = u16::from_be_bytes([
            self.read_buf[4 + address_len],
            self.read_buf[4 + address_len + 1],
        ]);
        self.read_buf.drain(..total_len);
        self.stage = Stage::Done;

        HandshakeProgress::Connect { host, port }
    }

    /// 핸드셰이크 뒤에 클라이언트가 미리 보내 둔 데이터. CONNECT 응답을 기다리지
    /// 않고 바로 쏘는 클라이언트가 있어서, 이걸 버리면 요청 첫 조각이 사라진다.
    pub fn take_buffered_input(&mut self) -> Vec<u8> {
        std::mem::take(&mut self.read_buf)
    }

    fn reply_error(&mut self, code: u8) {
        let reply = success_reply(code);
        // 실패 경로라 최선만 다한다: 짧게 블로킹으로 흘려보내고 정리한다.
        let _ = self.stream.set_nonblocking(false);
        let _ = self.stream.set_write_timeout(Some(ERROR_REPLY_TIMEOUT));
        let _ = self.stream.write_all(&reply);
        let _ = self.stream.shutdown(Shutdown::Both);
    }

    /// 실패 응답을 보내고 커넥션을 닫는다 (채널 열기가 실패했을 때 호출).
    pub fn fail_with(mut self, code: u8) {
        self.reply_error(code);
    }

    fn drain_write_buf(&mut self) -> Result<(), ()> {
        while !self.write_buf.is_empty() {
            match self.stream.write(&self.write_buf) {
                Ok(0) => return Err(()),
                Ok(n) => {
                    self.write_buf.drain(..n);
                }
                Err(e) if e.kind() == ErrorKind::WouldBlock => break,
                Err(_) => return Err(()),
            }
        }
        Ok(())
    }
}

/// VER | REP | RSV | ATYP | BND.ADDR | BND.PORT
/// 바인드 주소는 0.0.0.0:0으로 채운다 — 클라이언트가 쓰지 않는 값이고,
/// 터널 반대편의 실제 소스 주소를 알 방법도 없다.
pub fn success_reply(code: u8) -> [u8; 10] {
    [SOCKS_VERSION, code, 0x00, ATYP_IPV4, 0, 0, 0, 0, 0, 0]
}
