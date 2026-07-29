import path from "node:path"
import { fileURLToPath } from "node:url"

import { defineConfig } from "vitest/config"

const sourceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "src")

export default defineConfig({
  resolve: {
    alias: [{ find: /^~(.*)$/, replacement: `${sourceRoot}/$1` }],
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
})
