import crypto from "node:crypto"
import fs from "node:fs"
import path from "node:path"
import process from "node:process"

const projectRoot = process.cwd()
const vendorSourcePath = path.resolve(
  projectRoot,
  "node_modules/@mermaid-js/tiny/dist/mermaid.tiny.js",
)
const targetPath = path.resolve(projectRoot, "assets/assistant-mermaid-vendor.js")
const fingerprintPrefix = "/* ophel-assistant-mermaid-vendor:"

function createFingerprint(source) {
  return crypto
    .createHash("sha256")
    .update("ophel-assistant-mermaid-tiny-v1")
    .update(source)
    .digest("hex")
}

function extractFingerprint(currentContent) {
  if (!currentContent.startsWith(fingerprintPrefix)) {
    return null
  }

  const lineEndIndex = currentContent.indexOf("*/")
  if (lineEndIndex === -1) {
    return null
  }

  return currentContent.slice(fingerprintPrefix.length, lineEndIndex)
}

if (!fs.existsSync(vendorSourcePath)) {
  console.error(`[prepare-mermaid-assets] Tiny Mermaid bundle not found: ${vendorSourcePath}`)
  process.exit(1)
}

const vendorSource = fs.readFileSync(vendorSourcePath, "utf-8")
const fingerprint = createFingerprint(vendorSource)
const currentContent = fs.existsSync(targetPath) ? fs.readFileSync(targetPath, "utf-8") : null
const currentFingerprint = currentContent ? extractFingerprint(currentContent) : null

if (currentFingerprint === fingerprint) {
  console.log("[prepare-mermaid-assets] assistant-mermaid-vendor.js is up to date")
  process.exit(0)
}

const finalSource = `${fingerprintPrefix}${fingerprint} */\n${vendorSource}`

fs.mkdirSync(path.dirname(targetPath), { recursive: true })
fs.writeFileSync(targetPath, finalSource, "utf-8")

console.log("[prepare-mermaid-assets] Copied Tiny Mermaid vendor bundle")
