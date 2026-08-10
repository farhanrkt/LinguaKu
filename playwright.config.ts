import { defineConfig, devices } from '@playwright/test';

const PORT = 4173;

/**
 * SPEC §13 smoke: install → session → offline reload → resume.
 * Runs against the real production build, because the service worker (and so
 * everything about offline) does not exist in dev.
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'retain-on-failure',
  },
  projects: [
    // The reference device (SPEC §5.4) is a mid-range Android, so that is what
    // the smoke test emulates — not a desktop viewport.
    { name: 'android-chrome', use: { ...devices['Pixel 5'] } },
  ],
  webServer: {
    command: `npm run build && npm run preview -- --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
