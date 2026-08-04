//! Shared plumbing for copying bytes between a libssh2 channel and a local
//! TCP socket. Used by the bastion tunnel (one channel per tunnel) and by
//! local port forwarding (many channels per forward).

use ssh2::Channel;
use std::io::{ErrorKind, Read, Write};
use std::net::TcpStream;
use std::thread;
use std::time::Duration;

pub(crate) const COPY_BUF_SIZE: usize = 32 * 1024;
const BRIDGE_IDLE_SLEEP_MS: u64 = 2;
const BRIDGE_WRITE_RETRY_MS: u64 = 2;

/// Single-thread bridge: only this thread touches the channel (libssh2 is not thread-safe).
/// Each iteration: try channel→stream, then try stream→channel. Non-blocking channel +
/// short timeout on stream so we don't deadlock.
pub(crate) fn bridge_channel_and_stream(mut channel: Channel, mut stream: TcpStream) {
    let mut from_channel = [0u8; COPY_BUF_SIZE];
    let mut from_stream = [0u8; COPY_BUF_SIZE];
    loop {
        match channel.read(&mut from_channel) {
            Ok(0) => {
                // On a non-blocking channel Ok(0) can mean "no data"; only a
                // real EOF ends the tunnel.
                if channel.eof() {
                    break;
                }
            }
            Ok(n) => {
                if stream.write_all(&from_channel[..n]).is_err() {
                    break;
                }
            }
            Err(e) if e.kind() == ErrorKind::WouldBlock => {}
            Err(_) => break,
        }
        match stream.read(&mut from_stream) {
            Ok(0) => break,
            Ok(n) => {
                if channel_write_fully(&mut channel, &from_stream[..n]).is_err() {
                    break;
                }
            }
            // The read timeout shows up as WouldBlock or TimedOut depending on
            // platform; any other error (ConnectionReset, BrokenPipe) means the
            // local end is dead — exit instead of spinning forever.
            Err(e) if e.kind() == ErrorKind::WouldBlock || e.kind() == ErrorKind::TimedOut => {}
            Err(_) => break,
        }
        thread::sleep(Duration::from_millis(BRIDGE_IDLE_SLEEP_MS));
    }
    let _ = channel.close();
}

/// Writes the whole buffer to the non-blocking channel, retrying on
/// WouldBlock. `write_all` aborts on WouldBlock after a partial write and the
/// already-consumed bytes would be silently lost mid-tunnel.
pub(crate) fn channel_write_fully(channel: &mut Channel, data: &[u8]) -> Result<(), ()> {
    let mut written = 0;
    while written < data.len() {
        match channel.write(&data[written..]) {
            Ok(0) => return Err(()),
            Ok(n) => written += n,
            Err(e) if e.kind() == ErrorKind::WouldBlock => {
                thread::sleep(Duration::from_millis(BRIDGE_WRITE_RETRY_MS));
            }
            Err(_) => return Err(()),
        }
    }
    Ok(())
}
