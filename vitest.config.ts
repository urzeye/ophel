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
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    restoreMocks: true,
    clearMocks: true,
  },
})
