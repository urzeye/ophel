import { existsSync, rmSync, statSync } from "node:fs"
import path from "node:path"

import { zipDirectory } from "./zip-directory.mjs"

const rootDir = process.cwd()
const sourceDir = path.join(rootDir, "build", "firefox-mv3-prod")
const outputZip = path.join(rootDir, "build", "firefox-mv3-prod.zip")

if (!existsSync(sourceDir) || !statSync(sourceDir).isDirectory()) {
  console.error(`Firefox build output not found: ${sourceDir}`)
  console.error("Run `pnpm build:firefox` before packaging.")
  process.exit(1)
}

rmSync(outputZip, { force: true })

try {
  zipDirectory(sourceDir, outputZip)
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
}

if (!existsSync(outputZip)) {
  console.error(`Failed to create zip: ${outputZip}`)
  process.exit(1)
}

const size = statSync(outputZip).size
if (size <= 0) {
  console.error(`Created zip is empty: ${outputZip}`)
  process.exit(1)
}

const sizeInMb = (size / 1024 / 1024).toFixed(2)
console.log(`Created ${path.relative(rootDir, outputZip)} (${sizeInMb} MB)`)
