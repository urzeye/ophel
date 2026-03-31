import fs from "node:fs"
import path from "node:path"
import process from "node:process"

const projectRoot = process.cwd()
const sourcePath = path.resolve(projectRoot, "node_modules/mermaid/dist/mermaid.min.js")
const targetPath = path.resolve(projectRoot, "assets/assistant-mermaid-vendor.js")

if (!fs.existsSync(sourcePath)) {
  console.error(`[prepare-mermaid-assets] Mermaid bundle not found: ${sourcePath}`)
  process.exit(1)
}

const sourceContent = fs.readFileSync(sourcePath, "utf-8")
const currentContent = fs.existsSync(targetPath) ? fs.readFileSync(targetPath, "utf-8") : null

if (currentContent === sourceContent) {
  console.log("[prepare-mermaid-assets] assistant-mermaid-vendor.js is up to date")
  process.exit(0)
}

fs.mkdirSync(path.dirname(targetPath), { recursive: true })
fs.writeFileSync(targetPath, sourceContent, "utf-8")

console.log("[prepare-mermaid-assets] Copied mermaid.min.js -> assets/assistant-mermaid-vendor.js")
