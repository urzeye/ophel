import { spawnSync } from "node:child_process"
import { createRequire } from "node:module"
import path from "node:path"

const require = createRequire(import.meta.url)
const vitePkg = require.resolve("vite/package.json")
const viteBin = path.join(path.dirname(vitePkg), "bin", "vite.js")
const result = spawnSync(
  process.execPath,
  [viteBin, "build", "--config", "vite.userscript.config.ts"],
  {
    stdio: "inherit",
    env: {
      ...process.env,
      USERSCRIPT_ASSET_BASE_URL: "http://127.0.0.1:8123",
    },
  },
)

process.exit(result.status ?? 1)
