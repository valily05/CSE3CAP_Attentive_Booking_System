import { defineConfig, devices } from "@playwright/test";

// End-to-end against the real stack: Go API + Postgres (its own e2e database,
// reseeded every run) + Mailpit for email + the production Next build.
// Needs `docker compose up -d` from the repo root.
const E2E_DB = "postgres://careconnect:careconnect@localhost:5433/careconnect_e2e?sslmode=disable";
const GO = `${process.env.HOME}/.local/go/bin/go`;

export default defineConfig({
  testDir: "e2e",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  globalSetup: "./e2e/global-setup.ts",
  use: { baseURL: "http://localhost:3100", trace: "retain-on-failure", locale: "en-GB", timezoneId: "Asia/Jakarta" },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "phone", use: { ...devices["Pixel 7"] }, grep: /@phone/ },
  ],
  webServer: [
    {
      command: `bash ../frontend/e2e/prepare-db.sh && ${GO} run ./cmd/api`,
      cwd: "../backend",
      url: "http://localhost:8099/api/catalog",
      env: { DATABASE_URL: E2E_DB, HTTP_ADDR: ":8099", RUN_JOBS: "false", PUBLIC_URL: "http://localhost:3100", SMTP_ADDR: "localhost:1025" },
      reuseExistingServer: false,
      timeout: 120_000,
    },
    {
      command: "npx next build && npx next start -p 3100",
      url: "http://localhost:3100/privacy",
      env: { API_URL: "http://localhost:8099", NEXT_TELEMETRY_DISABLED: "1" },
      reuseExistingServer: false,
      timeout: 300_000,
    },
  ],
});
