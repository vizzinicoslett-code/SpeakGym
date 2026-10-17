import { defineConfig, chromium } from '@playwright/test';
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

// Prefer Playwright's matching browser. The desktop workspace may also provide a
// newer cached headless Chromium; an explicit environment override always wins.
function cachedWindowsChromium(): string | undefined {
  if (process.platform !== 'win32') return undefined;
  const directories = [process.env.LOCALAPPDATA && join(process.env.LOCALAPPDATA, 'ms-playwright'), join(homedir(), 'AppData', 'Local', 'ms-playwright')].filter((path): path is string => Boolean(path));
  for (const directory of directories) {
    if (!existsSync(directory)) continue;
    const names = readdirSync(directory).filter(name => /^chromium_headless_shell-\d+$/.test(name)).sort().reverse();
    const cached = names.map(name => join(directory, name, 'chrome-headless-shell-win64', 'chrome-headless-shell.exe')).find(existsSync);
    if (cached) return cached;
  }
  return undefined;
}

const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE
  ?? (existsSync(chromium.executablePath()) ? undefined : cachedWindowsChromium());
const remoteBase = process.env.PLAYWRIGHT_BASE_URL;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  timeout: 45_000,
  expect: { timeout: 8_000 },
  reporter: [['list']],
  outputDir: 'test-results',
  use: {
    baseURL: remoteBase ?? 'http://127.0.0.1:4173/SpeakGym/',
    headless: true,
    viewport: { width: 1280, height: 900 },
    locale: 'zh-CN',
    timezoneId: 'Asia/Shanghai',
    permissions: ['microphone'],
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    launchOptions: {
      executablePath,
      args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'],
    },
  },
  webServer: remoteBase ? undefined : {
    command: 'npm run preview -- --host 127.0.0.1 --port 4173 --strictPort',
    url: 'http://127.0.0.1:4173/SpeakGym/',
    reuseExistingServer: true,
    timeout: 30_000,
  },
});
