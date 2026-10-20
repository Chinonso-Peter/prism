import { defineConfig, devices } from "@playwright/test";

const rpcUrl = "http://127.0.0.1:8765";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  reporter: "list",
  use: {
    ...devices["Desktop Chrome"],
    baseURL: "http://127.0.0.1:3000",
    trace: "retain-on-failure",
  },
  webServer: [
    {
      command: "node e2e/mock-rpc-server.cjs",
      url: `${rpcUrl}/health`,
      reuseExistingServer: !process.env.CI,
    },
    {
      command: "npm run start -- --hostname 127.0.0.1",
      url: "http://127.0.0.1:3000",
      reuseExistingServer: !process.env.CI,
      env: {
        NEXT_PUBLIC_HORIZON_URL: rpcUrl,
        NEXT_PUBLIC_SOROBAN_RPC_URL: rpcUrl,
      },
    },
  ],
});
