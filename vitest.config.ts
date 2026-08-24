import path from "node:path"
import { fileURLToPath } from "node:url"

import { defineConfig } from "vitest/config"

const sourceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "src")

// Plasmo 专用的 raw:/url: 资源前缀（如 platform/katex.ts 引入的 KaTeX 样式与字体）
// 只在 Plasmo/油猴构建期可解析；测试不依赖资源内容，统一 stub 为空字符串模块。
const plasmoAssetStubPlugin = {
  name: "vitest-plasmo-asset-stub",
  enforce: "pre" as const,
  resolveId(id: string) {
    if (id.startsWith("raw:") || id.startsWith("url:")) {
      return "\0plasmo-asset-stub"
    }
    return null
  },
  load(id: string) {
    if (id === "\0plasmo-asset-stub") {
      return 'export default ""'
    }
    return null
  },
}

export default defineConfig({
  plugins: [plasmoAssetStubPlugin],
  define: {
    __PLATFORM__: JSON.stringify("extension"),
  },
  resolve: {
    alias: [{ find: /^~(.*)$/, replacement: `${sourceRoot}/$1` }],
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts", "tests/**/*.test.mjs"],
    setupFiles: ["tests/setup.ts"],
  },
})
