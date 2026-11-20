import { defineConfig } from "@playwright/test"

import type { DaemonOptions } from "./e2e/fixtures.ts"

export const E2E_TOKEN = "e2e-secret-token"

/**
 * End-to-end tests run the real daemon and the built PWA with the deterministic echo provider
 * (no live models). Each worker starts its own daemon in a fresh temporary home (e2e/fixtures.ts),
 * so tests run in parallel. Build first: `bun run test:e2e` does both.
 */
export default defineConfig<DaemonOptions>({
  testDir: "e2e",
  fullyParallel: true,
  workers: process.env.CI ? 2 : 4,
  reporter: [["list"]],
  // Replies can include a pre-show visual check in headless Chrome, which is slower under a full run.
  expect: { timeout: 30_000 },
  use: { channel: "chrome", trace: "retain-on-failure" },
  projects: [
    {
      name: "desktop",
      testIgnore: /(tidy|unlock)\.spec/,
      use: { viewport: { width: 1280, height: 800 } },
    },
    {
      name: "phone",
      testIgnore: /(tidy|unlock)\.spec/,
      use: { viewport: { width: 375, height: 812 }, hasTouch: true, isMobile: true },
    },
    {
      name: "locked",
      testMatch: /unlock\.spec/,
      use: { viewport: { width: 375, height: 812 }, daemonEnv: { DOMO_TOKEN: E2E_TOKEN } },
    },
    {
      name: "tidy",
      testMatch: /tidy\.spec/,
      use: {
        viewport: { width: 1280, height: 800 },
        // A seconds-long away clock, so absence and tidying can be tested.
        daemonEnv: { DOMO_AWAY_SECONDS: "3", DOMO_TIDY_TICK_SECONDS: "0.5" },
      },
    },
  ],
})
