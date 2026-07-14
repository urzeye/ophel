import process from "node:process"

import { validateSiteSupport } from "./site-support-audit.mjs"

try {
  const registry = validateSiteSupport()
  console.log(
    `[site-support] ${registry.sites.length} adapters cover ${registry.hostnames.length} application hosts`,
  )
} catch (error) {
  console.error(`[site-support] ${error instanceof Error ? error.message : String(error)}`)
  process.exit(1)
}
