import path from "node:path"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

const root = path.resolve(import.meta.dirname, "..")

export default defineConfig({
  root,
  plugins: [react()],
  define: { __PLATFORM__: JSON.stringify("extension"), __OPHEL_DEV__: false },
  resolve: {
    alias: [
      {
        find: "~platform/impl",
        replacement: path.join(root, "tests/fixtures/image-export-platform.ts"),
      },
      { find: /^~(.*)$/, replacement: `${root}/src/$1` },
    ],
  },
  optimizeDeps: { entries: ["tests/fixtures/image-export.html"] },
  server: { host: "127.0.0.1", port: 4178, strictPort: true },
})
