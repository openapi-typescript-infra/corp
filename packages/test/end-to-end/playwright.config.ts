import {
  defineConfig,
  devices,
  type PlaywrightTestConfig,
  type ReporterDescription,
  type TraceMode,
} from '@playwright/test';
import dotenv from 'dotenv';

dotenv.config({ path: '.playwright.env' });

let projects: Required<PlaywrightTestConfig>['projects'] = [
  {
    name: 'chromium',
    use: { ...devices['Desktop Chrome'] },
  },
  {
    name: 'firefox',
    use: { ...devices['Desktop Firefox'] },
  },
  {
    name: 'webkit',
    use: { ...devices['Desktop Safari'] },
  },
  {
    name: 'MobileChrome',
    use: { ...devices['Pixel 5'] },
  },
  {
    name: 'MobileSafari',
    use: { ...devices['iPhone 12'] },
  },
];

if (process.env.DEVTOOLS) {
  const chromium = projects[0].use as NonNullable<PlaywrightTestConfig['use']>;
  chromium.launchOptions = chromium.launchOptions || {};
  chromium.launchOptions.devtools = true;
}

if (process.env.EXCLUDE_PROJECTS) {
  const exclude = process.env.EXCLUDE_PROJECTS.split(',');
  projects = projects.filter((p) => !exclude.includes(p.name as string));
}

if (process.env.INCLUDE_PROJECTS) {
  const include = process.env.INCLUDE_PROJECTS.split(',');
  projects = projects.filter((p) => include.includes(p.name as string));
}

function validUrl(url: string) {
  try {
    return new URL(url).href;
  } catch {
    return undefined;
  }
}

function getProxy() {
  const { JTM_PROXY } = process.env;
  if (JTM_PROXY) {
    return {
      proxy: {
        server: validUrl(JTM_PROXY) || 'http://127.0.0.1:9000/',
      },
    };
  }
  return undefined;
}

function getWorkerCount() {
  const runners = process.env.PLAYWRIGHT_WORKERS;
  if (runners === 'per-project') {
    return projects.length;
  }
  if (runners && !Number.isNaN(Number(runners))) {
    return Number(runners);
  }
  return process.env.CI ? 2 : undefined;
}

function getReporters(): ReporterDescription[] {
  if (process.env.REPORTERS) {
    return process.env.REPORTERS.split(',').map((r) => [r]);
  }
  if (process.env.CI) {
    return [['list'], ['github'], ['html'], ['json', { outputFile: 'test-results.json' }]];
  }
  return [['html'], ['list']];
}

function getRetryCount(): number {
  const retries = process.env.RETRY_COUNT;
  if (retries && !Number.isNaN(Number(retries))) {
    return Number(retries);
  }
  return 0;
}

export default defineConfig({
  timeout: 90000,
  testDir: './src/__tests__',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: getRetryCount(),
  workers: getWorkerCount(),
  reporter: getReporters(),

  use: {
    contextOptions: {
      ignoreHTTPSErrors: true,
      ...(process.env.RECORD_VIDEOS
        ? {
            recordVideo: {
              dir: 'playwright-videos/',
            },
          }
        : {}),
    },

    trace: (process.env.PLAYWRIGHT_TRACE_CONFIG || 'retain-on-failure') as TraceMode,
    screenshot: 'only-on-failure',
    permissions: ['geolocation'],
    ...getProxy(),
  },

  projects,
});
