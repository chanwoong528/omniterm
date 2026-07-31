/**
 * Parses a pasted `ssh ...` command line into structured connection settings,
 * including a bastion hop expressed as `-o ProxyCommand="ssh ... -W %h:%p user@bastion"`
 * or `-J user@bastion[:port]` (ProxyJump).
 */

export interface ParsedSshEndpoint {
  host: string;
  username: string;
  port: number;
  keyPath?: string;
}

export interface ParsedSshCommand {
  target: ParsedSshEndpoint;
  bastion?: ParsedSshEndpoint;
}

export type ParseSshResult =
  | { ok: true; value: ParsedSshCommand }
  | { ok: false; reason: string };

const DEFAULT_SSH_PORT = 22;

/** ssh flags that consume the following token as their value. */
const FLAGS_WITH_VALUE = new Set([
  '-i', '-p', '-o', '-J', '-l', '-W', '-F', '-L', '-R', '-D',
  '-e', '-c', '-m', '-O', '-Q', '-S', '-b', '-E', '-B', '-I', '-w',
]);

/**
 * Shell-like tokenizer: honors single/double quotes anywhere in a token
 * (e.g. `ProxyCommand="ssh ..."`) and treats backslash-newline as whitespace.
 */
function tokenize(input: string): string[] {
  const normalized = input.replace(/\\\s*\n/g, ' ');
  const tokens: string[] = [];
  let current = '';
  let hasContent = false;
  let quote: '"' | "'" | null = null;

  for (let i = 0; i < normalized.length; i++) {
    const ch = normalized[i];
    if (quote) {
      if (ch === quote) {
        quote = null;
      } else {
        current += ch;
      }
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      hasContent = true;
      continue;
    }
    if (/\s/.test(ch)) {
      if (hasContent || current.length > 0) {
        tokens.push(current);
        current = '';
        hasContent = false;
      }
      continue;
    }
    current += ch;
    hasContent = true;
  }
  if (hasContent || current.length > 0) tokens.push(current);
  return tokens;
}

/** Parses `[user@]host` or `ssh://[user@]host[:port]`. */
function parseDestination(raw: string): { host: string; username: string; port?: number } | null {
  let rest = raw;
  let port: number | undefined;
  if (rest.startsWith('ssh://')) {
    rest = rest.slice('ssh://'.length);
    const portMatch = rest.match(/:(\d+)$/);
    if (portMatch) {
      port = Number(portMatch[1]);
      rest = rest.slice(0, -portMatch[0].length);
    }
  }
  const at = rest.lastIndexOf('@');
  const username = at >= 0 ? rest.slice(0, at) : '';
  const host = at >= 0 ? rest.slice(at + 1) : rest;
  if (!host) return null;
  return { host, username, port };
}

/** Parses ProxyJump syntax: `[user@]host[:port]` (first hop only). */
function parseJumpSpec(raw: string): ParsedSshEndpoint | null {
  const firstHop = raw.split(',')[0];
  const portMatch = firstHop.match(/:(\d+)$/);
  const withoutPort = portMatch ? firstHop.slice(0, -portMatch[0].length) : firstHop;
  const dest = parseDestination(withoutPort);
  if (!dest) return null;
  return {
    host: dest.host,
    username: dest.username,
    port: portMatch ? Number(portMatch[1]) : DEFAULT_SSH_PORT,
    keyPath: undefined,
  };
}

interface SshSpec {
  destination: { host: string; username: string; port?: number } | null;
  keyPath?: string;
  port?: number;
  proxyCommand?: string;
  proxyJump?: string;
}

/** Walks one ssh token list (already stripped of the leading `ssh`). */
function parseSshTokens(tokens: string[]): SshSpec {
  const spec: SshSpec = { destination: null };
  let username: string | undefined;
  let i = 0;
  while (i < tokens.length) {
    const token = tokens[i];
    if (token.startsWith('-') && token.length > 1) {
      if (FLAGS_WITH_VALUE.has(token)) {
        const value = tokens[i + 1] ?? '';
        if (token === '-i') spec.keyPath = value;
        else if (token === '-p' && /^\d+$/.test(value)) spec.port = Number(value);
        else if (token === '-l') username = value;
        else if (token === '-J') spec.proxyJump = value;
        else if (token === '-o') {
          const eq = value.indexOf('=');
          if (eq > 0) {
            const key = value.slice(0, eq).trim().toLowerCase();
            const optionValue = value.slice(eq + 1).trim();
            if (key === 'proxycommand') spec.proxyCommand = optionValue;
            if (key === 'proxyjump') spec.proxyJump = optionValue;
            if (key === 'user' && !username) username = optionValue;
            if (key === 'port' && /^\d+$/.test(optionValue)) spec.port = Number(optionValue);
            if (key === 'identityfile' && !spec.keyPath) spec.keyPath = optionValue;
          }
        }
        i += 2;
        continue;
      }
      // Boolean flag (-v, -A, -tt, ...): skip it.
      i += 1;
      continue;
    }
    // First non-flag token is the destination; anything after is a remote
    // command and can be ignored.
    spec.destination = parseDestination(token);
    break;
  }
  if (spec.destination && username) spec.destination.username = username;
  return spec;
}

export function parseSshCommand(input: string): ParseSshResult {
  const tokens = tokenize(input.trim());
  if (tokens.length === 0) return { ok: false, reason: 'Enter an ssh command.' };
  if (tokens[0] !== 'ssh') {
    return { ok: false, reason: 'Only commands starting with `ssh` are supported.' };
  }

  const spec = parseSshTokens(tokens.slice(1));
  if (!spec.destination) {
    return { ok: false, reason: 'Could not find a destination (user@host).' };
  }

  const target: ParsedSshEndpoint = {
    host: spec.destination.host,
    username: spec.destination.username,
    port: spec.port ?? spec.destination.port ?? DEFAULT_SSH_PORT,
    keyPath: spec.keyPath,
  };

  let bastion: ParsedSshEndpoint | undefined;

  if (spec.proxyCommand) {
    const proxyTokens = tokenize(spec.proxyCommand);
    if (proxyTokens[0] !== 'ssh') {
      return { ok: false, reason: 'Only ssh commands are supported in ProxyCommand.' };
    }
    const proxySpec = parseSshTokens(proxyTokens.slice(1));
    if (!proxySpec.destination) {
      return { ok: false, reason: 'Could not find a bastion (user@host) in ProxyCommand.' };
    }
    bastion = {
      host: proxySpec.destination.host,
      username: proxySpec.destination.username,
      port: proxySpec.port ?? proxySpec.destination.port ?? DEFAULT_SSH_PORT,
      keyPath: proxySpec.keyPath,
    };
  } else if (spec.proxyJump) {
    const jump = parseJumpSpec(spec.proxyJump);
    if (!jump) {
      return { ok: false, reason: 'Could not parse the ProxyJump (-J) value.' };
    }
    // -J hops authenticate with the same identity in the common case.
    bastion = { ...jump, keyPath: jump.keyPath ?? spec.keyPath };
  }

  return { ok: true, value: { target, bastion } };
}
