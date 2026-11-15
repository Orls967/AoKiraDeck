import { defineConfig } from '@playwright/test';

/**
 * Captures the README screenshot gallery into `docs/screenshots/`.
 *
 *   # Live GitHub Pages site (browser-only Rust/WASM mode, API offline)
 *   SHOTS_TARGET=pages SHOTS_BASE_URL=https://orls967.github.io/AoKira/ \
 *     npx playwright test -c playwright.screenshots.config.ts
 *
 *   # Local build wired to the FastAPI service (Python enrichment & optimization)
 *   SHOTS_TARGET=api SHOTS_BASE_URL=http://127.0.0.1:4174/ \
 *     npx playwright test -c playwright.screenshots.config.ts
 */
export default defineConfig({
  testDir: './screenshots',
  timeout: 240_000,
  expect: { timeout: 30_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: process.env.SHOTS_BASE_URL || 'http://127.0.0.1:4173/',
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
    locale: 'en-US',
    colorScheme: 'dark',
    launchOptions: {
      channel: 'chrome',
      args: ['--enable-webgl', '--ignore-gpu-blocklist', '--lang=en-US'],
    },
  },
});
