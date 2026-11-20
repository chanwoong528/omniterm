/**
 * Demo data for the landing-page screenshots — one consistent story:
 * a small team deploying an API behind a bastion host.
 *
 * Rules: no real hosts, IPs, people or companies. Hosts are `*.example.com`
 * or private `10.0.x.x`, users are `deploy` / `ubuntu` / `ci`, and key paths
 * live under the fake `/Users/demo/.ssh/`.
 *
 * Edit this file to change what the screenshots show, then run `npm run shots`.
 */
import type { RegisteredKeyMeta } from '../../src/types/key-manager';
import type { PortForwardStatus } from '../../src/types/port-forward';
import type { SavedSession } from '../../src/types/session';
import type { SftpEntry } from '../../src/domains/sftp/types';

// ─── Keys ────────────────────────────────────────────────────────────────────

export const DEMO_KEYS: RegisteredKeyMeta[] = [
  {
    id: 'key-deploy',
    label: 'deploy_ed25519',
    storageKey: '/Users/demo/.ssh/deploy_ed25519',
    keyType: 'key',
    createdAt: '2026-09-02T08:00:00.000Z',
  },
  {
    id: 'key-bastion',
    label: 'bastion',
    storageKey: '/Users/demo/.ssh/bastion.pem',
    keyType: '.pem',
    createdAt: '2026-09-02T08:01:00.000Z',
  },
  {
    id: 'key-staging',
    label: 'staging_rsa',
    storageKey: '/Users/demo/.ssh/staging/id_rsa',
    keyType: 'id_rsa',
    createdAt: '2026-10-11T02:30:00.000Z',
  },
  {
    id: 'key-ci',
    label: 'build-runner',
    storageKey: '/Users/demo/.ssh/build-runner.pem',
    keyType: '.pem',
    createdAt: '2026-11-03T05:45:00.000Z',
  },
];

// ─── Saved sessions ──────────────────────────────────────────────────────────

const BASTION = {
  host: 'bastion.example.com',
  port: 22,
  username: 'ubuntu',
  authMethod: 'private_key' as const,
  privateKeyId: 'key-bastion',
};

export const DB_FORWARD_RULE_ID = 'pf-db-postgres';

export const DEMO_SESSIONS: SavedSession[] = [
  {
    id: 'sess-prod-api',
    label: 'prod-api',
    folder: 'Production',
    target: {
      host: '10.0.1.20',
      port: 22,
      username: 'deploy',
      authMethod: 'private_key',
      privateKeyId: 'key-deploy',
    },
    useBastion: true,
    bastion: BASTION,
    reuseBastionAuth: false,
    lastConnectedAt: '2026-11-20T09:12:44.000Z',
  },
  {
    id: 'sess-db-replica',
    label: 'db-replica',
    folder: 'Production',
    target: {
      host: '10.0.1.31',
      port: 22,
      username: 'ubuntu',
      authMethod: 'private_key',
      privateKeyId: 'key-bastion',
    },
    useBastion: true,
    bastion: BASTION,
    reuseBastionAuth: true,
    portForwards: [
      {
        id: DB_FORWARD_RULE_ID,
        kind: 'local',
        label: 'Postgres',
        localHost: '127.0.0.1',
        localPort: 15432,
        remoteHost: 'localhost',
        remotePort: 5432,
        autoStart: true,
      },
    ],
    lastConnectedAt: '2026-11-20T08:55:10.000Z',
  },
  {
    id: 'sess-bastion',
    label: 'bastion',
    folder: 'Production',
    target: { ...BASTION },
    useBastion: false,
    lastConnectedAt: '2026-11-18T07:40:00.000Z',
  },
  {
    id: 'sess-staging-web',
    label: 'staging-web',
    target: {
      host: 'staging.example.com',
      port: 22,
      username: 'deploy',
      authMethod: 'private_key',
      privateKeyId: 'key-staging',
    },
    useBastion: false,
    lastConnectedAt: '2026-11-20T10:03:27.000Z',
  },
  {
    id: 'sess-build-runner',
    label: 'build-runner',
    target: {
      host: 'ci.example.com',
      port: 2222,
      username: 'ci',
      authMethod: 'private_key',
      privateKeyId: 'key-ci',
    },
    useBastion: false,
    lastConnectedAt: '2026-11-17T13:20:00.000Z',
  },
];

/** Running port forwards reported by the (mocked) backend. */
export const DEMO_PORT_FORWARD_STATUSES: PortForwardStatus[] = [
  {
    ruleId: DB_FORWARD_RULE_ID,
    savedSessionId: 'sess-db-replica',
    kind: 'local',
    state: 'running',
    localHost: '127.0.0.1',
    localPort: 15432,
    remoteHost: 'localhost',
    remotePort: 5432,
    activeConnections: 1,
    totalConnections: 3,
  },
];

// ─── Terminal sessions (open tabs) ───────────────────────────────────────────

const ESC = '\x1b[';
const RESET = `${ESC}0m`;
const bold = (color: number, text: string) => `${ESC}1;${color}m${text}${RESET}`;
const color = (code: number, text: string) => `${ESC}${code}m${text}${RESET}`;

/** Ubuntu's default colored bash prompt: green user@host, blue cwd. */
function prompt(userAtHost: string, cwd: string): string {
  return `${bold(32, userAtHost)}:${bold(34, cwd)}$ `;
}

function gitLogLine(hash: string, subject: string, refs?: string): string {
  const decoration = refs ? ` ${refs}` : '';
  return `${color(33, hash)}${decoration} ${subject}`;
}

const HEAD_REFS = `${color(33, '(')}${bold(36, 'HEAD -> ')}${bold(32, 'main')}${color(33, ', ')}${bold(31, 'origin/main')}${color(33, ')')}`;

/**
 * Lines are kept at 53 columns or fewer so the same output reads cleanly in
 * the wide desktop shot and in the ~440px mobile crop without wrapping.
 */
const PROD_API_LINES = [
  'Last login: Fri Nov 20 09:12:44 2026 from 10.0.0.5',
  `${prompt('deploy@prod-api', '~')}cd app`,
  `${prompt('deploy@prod-api', '~/app')}git log --oneline -5`,
  gitLogLine('a41c9e2', 'Add healthz route', HEAD_REFS),
  gitLogLine('7d03b18', 'Bump express to 4.21.2'),
  gitLogLine('e5f2a90', 'Cache user sessions in Redis'),
  gitLogLine('3c8d1f4', 'Fix timezone in invoice export'),
  gitLogLine('9b27e66', 'Rate-limit POST /api/login'),
  `${prompt('deploy@prod-api', '~/app')}systemctl is-active api worker`,
  'active',
  'active',
  `${prompt('deploy@prod-api', '~/app')}df -h /`,
  'Filesystem      Size  Used Avail Use% Mounted on',
  '/dev/root        49G   18G   31G  37% /',
  `${prompt('deploy@prod-api', '~/app')}ls logs`,
  `access.log  ${bold(31, 'access.log.1.gz')}  error.log`,
  `${prompt('deploy@prod-api', '~/app')}tail -n 5 logs/access.log`,
  '10:41:58 GET  /healthz          200   2ms',
  '10:42:03 POST /api/login        200  41ms',
  '10:42:05 GET  /api/orders?p=2   200  18ms',
  '10:42:07 GET  /api/orders/1182  200  12ms',
  '10:42:09 GET  /api/me           304   3ms',
];

const STAGING_WEB_LINES = [
  'Last login: Fri Nov 20 10:03:27 2026 from 10.0.0.5',
  `${prompt('deploy@staging-web', '~')}cd app && git pull`,
  'Updating 7d03b18..a41c9e2',
  'Fast-forward',
  ` src/routes/health.ts | 12 ${color(32, '++++++++++++')}`,
  ` src/server.ts        |  2 ${color(32, '++')}`,
  ' 2 files changed, 14 insertions(+)',
  `${prompt('deploy@staging-web', '~/app')}sudo systemctl restart web`,
  `${prompt('deploy@staging-web', '~/app')}systemctl is-active web`,
  'active',
  `${prompt('deploy@staging-web', '~/app')}curl -s localhost:3000/healthz`,
  '{"status":"ok","version":"1.9.0"}',
];

/** Typed at staging-web's idle prompt in feature-tabs only, so the shell fills its crop. */
const STAGING_WEB_FOLLOW_UP_LINES = [
  'git log --oneline -1',
  gitLogLine('a41c9e2', 'Add healthz route', HEAD_REFS),
  `${prompt('deploy@staging-web', '~/app')}uptime -p`,
  'up 6 days, 2 hours, 41 minutes',
];

/**
 * Typed at prod-api's idle prompt in the hero shots only, so the shell fills
 * the shorter hero window to the bottom. Other scenes (feature-macos) keep the
 * shorter history above. The first line continues the idle prompt.
 */
const PROD_API_FOLLOW_UP_LINES = [
  'journalctl -u api -n 5 -o cat',
  'Stopping api.service - Example API server...',
  'Stopped api.service - Example API server.',
  'Started api.service - Example API server.',
  'Connected to Redis at 127.0.0.1:6379',
  'Listening on 127.0.0.1:3000 (pid 4182)',
  `${prompt('deploy@prod-api', '~/app')}pgrep -a node`,
  '4182 node dist/server.js',
  '4190 node dist/worker.js',
  `${prompt('deploy@prod-api', '~/app')}du -sh dist logs`,
  '3.2M\tdist',
  '48M\tlogs',
];

const DB_REPLICA_LINES = [
  'Last login: Fri Nov 20 08:55:10 2026 from 10.0.0.5',
  `${prompt('ubuntu@db-replica', '~')}systemctl is-active postgresql`,
  'active',
  `${prompt('ubuntu@db-replica', '~')}df -h /data`,
  'Filesystem      Size  Used Avail Use% Mounted on',
  '/dev/nvme1n1    200G   71G  130G  36% /data',
];

export interface DemoTerminal {
  /** Runtime session id the backend would hand out after connecting. */
  runtimeSessionId: string;
  savedSessionId: string;
  /** Tab title exactly as the app builds it: `${username}@${host}`. */
  title: string;
  homePath: string;
  output: string;
  /** The prompt left at the bottom, waiting for input. */
  idlePrompt: string;
  /** More commands typed at the idle prompt, for scenes that list this terminal in `followUpTerminals`. */
  followUpOutput?: string;
}

function buildOutput(lines: string[], idlePrompt: string): string {
  return `${lines.join('\r\n')}\r\n${idlePrompt}`;
}

function buildTerminal(
  args: Omit<DemoTerminal, 'output' | 'followUpOutput'> & { lines: string[]; followUpLines?: string[] }
): DemoTerminal {
  const { lines, followUpLines, ...rest } = args;
  return {
    ...rest,
    output: buildOutput(lines, args.idlePrompt),
    followUpOutput: followUpLines && buildOutput(followUpLines, args.idlePrompt),
  };
}

export const DEMO_TERMINALS = {
  prodApi: buildTerminal({
    runtimeSessionId: 'rt-prod-api',
    savedSessionId: 'sess-prod-api',
    title: 'deploy@10.0.1.20',
    homePath: '/home/deploy',
    lines: PROD_API_LINES,
    followUpLines: PROD_API_FOLLOW_UP_LINES,
    idlePrompt: prompt('deploy@prod-api', '~/app'),
  }),
  stagingWeb: buildTerminal({
    runtimeSessionId: 'rt-staging-web',
    savedSessionId: 'sess-staging-web',
    title: 'deploy@staging.example.com',
    homePath: '/home/deploy',
    lines: STAGING_WEB_LINES,
    followUpLines: STAGING_WEB_FOLLOW_UP_LINES,
    idlePrompt: prompt('deploy@staging-web', '~/app'),
  }),
  dbReplica: buildTerminal({
    runtimeSessionId: 'rt-db-replica',
    savedSessionId: 'sess-db-replica',
    title: 'ubuntu@10.0.1.31',
    homePath: '/home/ubuntu',
    lines: DB_REPLICA_LINES,
    idlePrompt: prompt('ubuntu@db-replica', '~'),
  }),
} satisfies Record<string, DemoTerminal>;

export type DemoTerminalKey = keyof typeof DEMO_TERMINALS;

// ─── SFTP listings ───────────────────────────────────────────────────────────

/** Unix seconds for a UTC wall-clock time (the capture browser runs in UTC). */
function utc(isoDate: string): number {
  return Math.floor(new Date(`${isoDate}Z`).getTime() / 1000);
}

function dir(parent: string, name: string, modified: string): SftpEntry {
  return { name, path: `${parent}/${name}`, isDir: true, isSymlink: false, mtime: utc(modified) };
}

function file(parent: string, name: string, size: number, modified: string): SftpEntry {
  return { name, path: `${parent}/${name}`, isDir: false, isSymlink: false, size, mtime: utc(modified) };
}

const DEPLOY_HOME = '/home/deploy';
export const DEPLOY_APP_DIR = `${DEPLOY_HOME}/app`;

/** Directory listings by absolute path (the mock backend sorts them like the real one). */
export const DEMO_SFTP_LISTINGS: Record<string, SftpEntry[]> = {
  [DEPLOY_HOME]: [
    dir(DEPLOY_HOME, '.cache', '2026-11-02T04:10:00'),
    dir(DEPLOY_HOME, '.ssh', '2026-09-02T08:05:00'),
    dir(DEPLOY_HOME, 'app', '2026-11-20T09:13:05'),
    dir(DEPLOY_HOME, 'backups', '2026-11-20T03:00:12'),
    file(DEPLOY_HOME, '.bash_history', 18_244, '2026-11-20T09:20:41'),
    file(DEPLOY_HOME, '.bashrc', 3_771, '2026-09-02T08:00:00'),
    file(DEPLOY_HOME, '.profile', 807, '2026-09-02T08:00:00'),
  ],
  [DEPLOY_APP_DIR]: [
    dir(DEPLOY_APP_DIR, '.git', '2026-11-20T09:13:05'),
    dir(DEPLOY_APP_DIR, 'config', '2026-11-12T06:21:00'),
    dir(DEPLOY_APP_DIR, 'dist', '2026-11-20T09:14:30'),
    dir(DEPLOY_APP_DIR, 'logs', '2026-11-20T10:42:09'),
    dir(DEPLOY_APP_DIR, 'migrations', '2026-11-06T02:48:00'),
    dir(DEPLOY_APP_DIR, 'node_modules', '2026-11-19T07:55:00'),
    dir(DEPLOY_APP_DIR, 'scripts', '2026-10-28T09:02:00'),
    file(DEPLOY_APP_DIR, '.env', 1_183, '2026-11-12T06:20:00'),
    file(DEPLOY_APP_DIR, 'README.md', 4_210, '2026-10-28T09:02:00'),
    file(DEPLOY_APP_DIR, 'Dockerfile', 612, '2026-11-06T02:48:00'),
    file(DEPLOY_APP_DIR, 'compose.yml', 1_846, '2026-11-12T06:21:00'),
    file(DEPLOY_APP_DIR, 'package-lock.json', 422_518, '2026-11-19T07:55:00'),
    file(DEPLOY_APP_DIR, 'package.json', 2_391, '2026-11-19T07:55:00'),
    file(DEPLOY_APP_DIR, 'release-1.9.0.tgz', 19_293_184, '2026-11-20T09:12:58'),
  ],
  '/home/ubuntu': [
    dir('/home/ubuntu', '.ssh', '2026-09-02T08:05:00'),
    dir('/home/ubuntu', 'scripts', '2026-10-21T01:10:00'),
    file('/home/ubuntu', '.bashrc', 3_771, '2026-09-02T08:00:00'),
    file('/home/ubuntu', 'pg_backup.sh', 1_402, '2026-10-21T01:10:00'),
  ],
};

/** Local files "dragged" onto the SFTP panel in the upload scene. */
export const DEMO_UPLOAD_PATHS = [
  '/Users/demo/Downloads/release-1.9.1.tgz',
  '/Users/demo/Downloads/nginx.conf',
];
