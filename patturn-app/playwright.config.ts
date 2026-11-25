import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  timeout: 30_000,
  reporter: [['list'], ['json', { outputFile: '.cache/browser-results.json' }]],
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? 'http://127.0.0.1:4173',
    headless: true,
    trace: 'retain-on-failure',
    launchOptions: {
      executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
      args: ['--no-sandbox', '--disable-dev-shm-usage'],
    },
  },
  projects: [
    {
      name: 'no-webgl',
      testMatch: [
        '**/editor.spec.ts',
        '**/pipeline.spec.ts',
        '**/accessibility.spec.ts',
        '**/offline.spec.ts',
      ],
      use: {
        launchOptions: {
          executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
          args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-webgl'],
        },
      },
    },
    {
      name: 'software-webgl',
      testMatch: '**/viewport.spec.ts',
      use: {
        launchOptions: {
          executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
          args: [
            '--no-sandbox',
            '--disable-dev-shm-usage',
            '--use-gl=angle',
            '--use-angle=swiftshader',
            '--enable-unsafe-swiftshader',
          ],
        },
      },
    },
  ],
  webServer: process.env.PLAYWRIGHT_BASE_URL
    ? undefined
    : {
        command: 'npm run preview -w @patturn/web -- --host 0.0.0.0 --port 4173 --strictPort',
        url: 'http://127.0.0.1:4173',
        reuseExistingServer: !process.env.CI,
        timeout: 30_000,
      },
});
