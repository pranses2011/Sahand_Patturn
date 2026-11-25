import { defineConfig } from '@playwright/test';
import base from './playwright.config';

// Opt-in diagnostic run: never substitute these lab numbers for installed-device evidence.
export default defineConfig({
  ...base,
  use: { ...base.use, baseURL: 'http://127.0.0.1:4174' },
  webServer: {
    command: 'npm run preview -w @patturn/web -- --host 0.0.0.0 --port 4174 --strictPort',
    url: 'http://127.0.0.1:4174',
    reuseExistingServer: false,
    timeout: 30_000,
  },
  retries: 0,
  timeout: 90_000,
  projects: [
    {
      name: 'performance-software-webgl',
      testMatch: '**/performance.spec.ts',
      use: {
        viewport: { width: 1365, height: 768 },
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
});
