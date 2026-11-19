import { defineConfig } from "@playwright/test"

const PORT = 7440
/** A second daemon with a seconds-long away clock, so absence and tidying can be tested. */
const TIDY_PORT = 7441
/** A third daemon that requires an access token, for the unlock flow. */
const LOCKED_PORT = 7442
export const E2E_TOKEN = "e2e-secret-token"

const daemon = (port: number) =>
  `sh -c 'node --no-warnings ../daemon/src/bin/domo.ts --home "$(mktemp -d)" --port ${port} serve'`

/**
 * End-to-end tests run the real daemon and the built PWA with the deterministic
 * echo provider (no live models) in a fresh temporary home. Build first:
 * `bun run test:e2e` does both.
 */
export default defineConfig({
  testDir: "e2e",
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  // Replies can include a pre-show visual check in headless Chrome, which is slower under a full run.
  expect: { timeout: 15_000 },
  use: { channel: "chrome", trace: "retain-on-failure" },
  projects: [
    {
      name: "desktop",
      testIgnore: /(tidy|unlock)\.spec/,
      use: { baseURL: `http://127.0.0.1:${PORT}`, viewport: { width: 1280, height: 800 } },
    },
    {
      name: "phone",
      testIgnore: /(tidy|unlock)\.spec/,
      use: {
        baseURL: `http://127.0.0.1:${PORT}`,
        viewport: { width: 375, height: 812 },
        hasTouch: true,
        isMobile: true,
      },
    },
    {
      name: "locked",
      testMatch: /unlock\.spec/,
      use: { baseURL: `http://127.0.0.1:${LOCKED_PORT}`, viewport: { width: 375, height: 812 } },
    },
    {
      name: "tidy",
      testMatch: /tidy\.spec/,
      use: { baseURL: `http://127.0.0.1:${TIDY_PORT}`, viewport: { width: 1280, height: 800 } },
    },
  ],
  webServer: [
    {
      command: daemon(PORT),
      url: `http://127.0.0.1:${PORT}`,
      env: { DOMO_PROVIDER: "echo", DOMO_TOKEN: "off" },
      reuseExistingServer: false,
      timeout: 30_000,
    },
    {
      command: daemon(TIDY_PORT),
      url: `http://127.0.0.1:${TIDY_PORT}`,
      env: {
        DOMO_PROVIDER: "echo",
        DOMO_TOKEN: "off",
        DOMO_AWAY_SECONDS: "3",
        DOMO_TIDY_TICK_SECONDS: "0.5",
      },
      reuseExistingServer: false,
      timeout: 30_000,
    },
    {
      command: daemon(LOCKED_PORT),
      url: `http://127.0.0.1:${LOCKED_PORT}`,
      env: { DOMO_PROVIDER: "echo", DOMO_TOKEN: E2E_TOKEN },
      reuseExistingServer: false,
      timeout: 30_000,
    },
  ],
})
