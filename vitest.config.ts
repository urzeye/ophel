import path from "node:path"

import { defineConfig } from "vitest/config"

export default defineConfig({
  define: {
    __PLATFORM__: JSON.stringify("extension"),
  },
  resolve: {
    alias: [{ find: /^~/, replacement: `${path.resolve(__dirname, "src")}/` }],
  },
  test: {
    include: ["tests/**/*.test.{ts,tsx}"],
    environment: "jsdom",
    globals: true,
    setupFiles: ["./tests/setup.ts"],
    restoreMocks: true,
    clearMocks: true,
  },
})
