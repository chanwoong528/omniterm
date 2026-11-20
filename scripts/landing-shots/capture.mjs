#!/usr/bin/env node
/**
 * Captures the landing-page screenshots from the real app UI.
 *
 *   npm run shots                        # all shots
 *   npm run shots -- hero feature-sftp   # only these scenes (manifest entries of the rest are kept)
 *
 * Starts a Vite dev server for capture.html, drives the installed Google
 * Chrome (fresh temporary profile) at devicePixelRatio 2, and writes PNGs plus
 * manifest.json to website/src/assets/screenshots/.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import sharp from 'sharp';
import { createServer } from 'vite';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '../..');
const OUTPUT_DIR = path.join(REPO_ROOT, 'website/src/assets/screenshots');
const MANIFEST_PATH = path.join(OUTPUT_DIR, 'manifest.json');
const VITE_CONFIG = path.join(HERE, 'vite.config.ts');
const DEVICE_SCALE_FACTOR = 2;
const SCENE_TIMEOUT_MS = 30_000;

/** Widths of fixed app chrome, used to size viewports for terminal crops. */
const TITLE_BAR_PX = 36;
const SIDEBAR_PX = 288; // scenes.ts layout for the narrow-terminal scenes
const SIDEBAR_HANDLE_PX = 6;
const COLLAPSED_SFTP_STRIP_PX = 29;
const chromeLeftOfTerminal = SIDEBAR_PX + SIDEBAR_HANDLE_PX + COLLAPSED_SFTP_STRIP_PX;

/** Terminal geometry: a viewport this tall gives exactly `rows` text rows, no partial row. */
const TERMINAL_TAB_BAR_PX = 35;
const TERMINAL_ROW_PX = 16; // 13px SF Mono cell height
const heightForTerminalRows = (rows) => TITLE_BAR_PX + TERMINAL_TAB_BAR_PX + rows * TERMINAL_ROW_PX;

/**
 * Row counts for the hero shots. prod-api prints 35 lines (with its follow-up),
 * so 33 rows start the view at `git log` and 27 rows at `systemctl`, each on a
 * prompt line. 33 rows also make the window end in the sidebar right after the
 * "Sessions are saved automatically" hint, before the Target Server label.
 */
const HERO_TERMINAL_ROWS = 33;
const HERO_MOBILE_TERMINAL_ROWS = 27;
/** staging-web prints 17 lines with its follow-up: the prompt lands on the last row. */
const FEATURE_TABS_TERMINAL_ROWS = 17;

const FEATURE_WIDTH = { min: 420, max: 520 };

/**
 * One entry per output file. `limits` are logical (CSS px) bounds from the
 * landing brief; the run fails if a crop drifts outside them.
 */
const SHOTS = [
  {
    file: 'hero.png',
    scene: 'hero',
    viewport: { width: 1200, height: heightForTerminalRows(HERO_TERMINAL_ROWS) },
    limits: { width: { min: 1200, max: 1200 }, maxHeight: 680 },
    shows:
      'The full OmniTerm window on macOS: saved-sessions sidebar, three terminal tabs, the SFTP browser and a busy shell.',
    alt: {
      en: 'OmniTerm window with a saved-sessions sidebar, an SFTP list of /home/deploy/app, and a terminal on a production server showing recent commits, service checks, access logs and the API service journal.',
      ko: '저장된 세션 사이드바, /home/deploy/app의 SFTP 파일 목록, 운영 서버의 최근 커밋·서비스 상태·접근 로그·API 서비스 로그를 보여 주는 터미널이 있는 OmniTerm 창',
    },
  },
  {
    file: 'hero-mobile.png',
    scene: 'hero-mobile',
    viewport: { width: chromeLeftOfTerminal + 440, height: heightForTerminalRows(HERO_MOBILE_TERMINAL_ROWS) },
    limits: { width: { min: 400, max: 440 }, maxHeight: 520 },
    shows: 'The terminal tab bar and shell from the hero shot, cropped for narrow screens.',
    alt: {
      en: 'OmniTerm terminal with three server tabs open, showing service status, disk usage, access logs and the API service journal on a production server.',
      ko: '서버 탭 세 개가 열린 OmniTerm 터미널. 운영 서버의 서비스 상태, 디스크 사용량, 접근 로그, API 서비스 로그가 보인다.',
    },
  },
  {
    file: 'feature-bastion.png',
    scene: 'feature-bastion',
    viewport: { width: 1200, height: 1100 },
    limits: { width: FEATURE_WIDTH, maxHeight: 560 },
    shows: 'The session form reaching a private host through a bastion (jump host).',
    alt: {
      en: 'Session form with "Use Bastion (Jump Host)" checked: the target deploy@10.0.1.20 is reached through ubuntu@bastion.example.com, each with its own private key.',
      ko: 'Use Bastion (Jump Host)가 체크된 세션 폼. 대상 서버 deploy@10.0.1.20에 ubuntu@bastion.example.com을 거쳐 접속하고, 두 서버가 각자 다른 개인 키를 쓴다.',
    },
  },
  {
    file: 'feature-tabs.png',
    scene: 'feature-tabs',
    viewport: { width: chromeLeftOfTerminal + 520, height: heightForTerminalRows(FEATURE_TABS_TERMINAL_ROWS) },
    limits: { width: FEATURE_WIDTH, maxHeight: 420 },
    shows: 'Several servers open at once as terminal tabs.',
    alt: {
      en: 'Three terminal tabs for different servers; the active staging tab shows a git pull, a service restart, a health check and the deployed commit.',
      ko: '서버별 터미널 탭 세 개. 활성화된 스테이징 탭에 git pull, 서비스 재시작, 헬스 체크, 배포된 커밋이 보인다.',
    },
  },
  {
    file: 'feature-sftp.png',
    scene: 'feature-sftp',
    viewport: { width: 1200, height: TITLE_BAR_PX + 480 },
    limits: { width: FEATURE_WIDTH, maxHeight: 480 },
    shows: 'The SFTP panel browsing a remote folder while dropped files upload.',
    alt: {
      en: 'SFTP panel listing /home/deploy/app with sizes and dates, an upload of two files in progress and a "Drop files to upload" hint.',
      ko: '/home/deploy/app의 파일 크기와 수정일을 보여 주는 SFTP 패널. 파일 두 개 업로드 진행 상태와 "Drop files to upload" 안내가 보인다.',
    },
  },
  {
    file: 'feature-keys.png',
    scene: 'feature-keys',
    viewport: { width: 1200, height: 760 },
    limits: { width: FEATURE_WIDTH, maxHeight: 420 },
    shows: 'The Key Manager tab listing registered private keys.',
    alt: {
      en: 'Key Manager tab listing four registered private keys: deploy_ed25519, bastion, staging_rsa and build-runner.',
      ko: '등록된 개인 키 네 개(deploy_ed25519, bastion, staging_rsa, build-runner)가 보이는 Key Manager 탭',
    },
  },
  {
    file: 'feature-sessions.png',
    scene: 'feature-sessions',
    viewport: { width: 1200, height: 760 },
    limits: { width: FEATURE_WIDTH, maxHeight: 420 },
    shows: 'Saved sessions grouped in a folder, with last-connected dates and a running port-forward badge.',
    alt: {
      en: 'Saved sessions: a Production folder with prod-api, db-replica (one port forward running) and bastion, plus staging-web and build-runner.',
      ko: '저장된 세션 목록. Production 폴더에 prod-api, db-replica(포트 포워딩 1개 실행 중), bastion이 있고 그 아래 staging-web, build-runner가 있다.',
    },
  },
  {
    file: 'feature-macos.png',
    scene: 'feature-macos',
    viewport: { width: 900, height: 600 },
    limits: { width: FEATURE_WIDTH, maxHeight: 400 },
    shows: 'Top-left corner of the macOS window: traffic-light buttons, title bar, sidebar and the first terminal tabs.',
    alt: {
      en: 'Corner of the OmniTerm window on macOS: red, yellow and green window buttons, the Omniterm title bar, the saved-sessions sidebar and terminal tabs.',
      ko: 'macOS에서 본 OmniTerm 창의 왼쪽 위. 빨강·노랑·초록 창 버튼, Omniterm 타이틀 바, 저장된 세션 사이드바, 터미널 탭이 보인다.',
    },
  },
];

function checkLimits(shot, clip) {
  const { width, maxHeight } = shot.limits;
  const problems = [];
  if (clip.width < width.min || clip.width > width.max) {
    problems.push(`width ${clip.width} not in ${width.min}–${width.max}`);
  }
  if (clip.height > maxHeight) problems.push(`height ${clip.height} > ${maxHeight}`);
  if (problems.length > 0) throw new Error(`${shot.file}: ${problems.join(', ')}`);
}

async function captureShot(browser, baseUrl, userAgent, shot) {
  const context = await browser.newContext({
    viewport: shot.viewport,
    deviceScaleFactor: DEVICE_SCALE_FACTOR,
    // The app picks its macOS title bar from the user agent.
    userAgent,
    locale: 'en-US',
    timezoneId: 'UTC',
    colorScheme: 'dark',
  });
  const page = await context.newPage();
  const pageProblems = [];
  page.on('pageerror', (error) => pageProblems.push(`pageerror: ${error.message}`));
  page.on('console', (message) => {
    if (message.type() === 'error') pageProblems.push(`console.error: ${message.text()}`);
    if (message.text().includes('unmocked command')) pageProblems.push(message.text());
  });

  try {
    await page.goto(`${baseUrl}/scripts/landing-shots/capture.html?scene=${shot.scene}`);
    await page.waitForFunction(() => window.__shot, null, { timeout: SCENE_TIMEOUT_MS });
    const result = await page.evaluate(() => window.__shot);
    if ('error' in result) throw new Error(`${shot.scene}: ${result.error}`);
    if (pageProblems.length > 0) throw new Error(`${shot.scene}:\n  ${pageProblems.join('\n  ')}`);

    const { clip } = result;
    checkLimits(shot, clip);
    const outputPath = path.join(OUTPUT_DIR, shot.file);
    // 'disabled' also freezes xterm's blinking cursor in its visible phase.
    await page.screenshot({ path: outputPath, clip, animations: 'disabled', scale: 'device' });

    const { width, height } = await sharp(outputPath).metadata();
    const expected = { width: clip.width * DEVICE_SCALE_FACTOR, height: clip.height * DEVICE_SCALE_FACTOR };
    if (width !== expected.width || height !== expected.height) {
      throw new Error(`${shot.file}: PNG is ${width}×${height}, expected ${expected.width}×${expected.height}`);
    }
    console.log(`✓ ${shot.file.padEnd(22)} ${clip.width}×${clip.height} (PNG ${width}×${height})`);
    return { width: clip.width, height: clip.height };
  } finally {
    await context.close();
  }
}

function buildManifestEntry(shot, logicalSize) {
  return {
    logicalSize,
    pixelSize: {
      width: logicalSize.width * DEVICE_SCALE_FACTOR,
      height: logicalSize.height * DEVICE_SCALE_FACTOR,
    },
    shows: shot.shows,
    alt: shot.alt,
  };
}

/** Rewrites manifest.json; a partial run keeps the entries of shots it skipped. */
async function writeManifest(capturedImages) {
  const previousImages = await readFile(MANIFEST_PATH, 'utf8')
    .then((text) => JSON.parse(text).images ?? {})
    .catch(() => ({}));
  const merged = { ...previousImages, ...capturedImages };
  // Keep the SHOTS order and drop files that are no longer produced.
  const images = Object.fromEntries(
    SHOTS.filter((shot) => merged[shot.file]).map((shot) => [shot.file, merged[shot.file]])
  );
  const manifest = {
    generatedBy: 'npm run shots (scripts/landing-shots/capture.mjs)',
    devicePixelRatio: DEVICE_SCALE_FACTOR,
    theme: 'dark',
    images,
  };
  await writeFile(MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`);
}

async function main() {
  const requestedScenes = process.argv.slice(2);
  const shots = requestedScenes.length
    ? SHOTS.filter((shot) => requestedScenes.includes(shot.scene))
    : SHOTS;
  if (shots.length === 0) throw new Error(`No shots match: ${requestedScenes.join(', ')}`);

  await mkdir(OUTPUT_DIR, { recursive: true });
  const server = await createServer({ configFile: VITE_CONFIG });
  let browser;
  try {
    await server.listen();
    const baseUrl = server.resolvedUrls?.local[0]?.replace(/\/$/, '');
    if (!baseUrl) throw new Error('Vite did not report a local URL');

    // A fresh temporary profile: never the user's Chrome data.
    browser = await chromium.launch({ channel: 'chrome', headless: true });
    const userAgent = `Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${browser.version()} Safari/537.36`;

    const manifestImages = {};
    for (const shot of shots) {
      const logicalSize = await captureShot(browser, baseUrl, userAgent, shot);
      manifestImages[shot.file] = buildManifestEntry(shot, logicalSize);
    }

    await writeManifest(manifestImages);
    console.log('✓ manifest.json');
  } finally {
    await browser?.close();
    await server.close();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
