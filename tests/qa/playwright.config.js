const { defineConfig } = require("@playwright/test");

module.exports = defineConfig({
  testDir: ".",
  testMatch: "**/*.spec.js",
  timeout: 90000,
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: process.env.EKOLOKO_BASE_URL || "http://localhost:8080",
    viewport: { width: 1200, height: 844 },
    headless: true,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
});
