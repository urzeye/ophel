import { createHash } from "node:crypto"
import fs from "node:fs"
import path from "node:path"

const buildRoot = path.resolve(process.argv[2] || "build/userscript")
const script = fs.readFileSync(path.join(buildRoot, "ophel.user.js"), "utf8")
const manifest = JSON.parse(
  fs.readFileSync(path.join(buildRoot, "userscript-assets/manifest.json"), "utf8"),
)
const resourceUrls = Object.fromEntries(
  Array.from(script.matchAll(/^\/\/ @resource\s+(\S+)\s+(\S+)$/gm), (match) => [
    match[1],
    match[2],
  ]),
)
const requireUrls = Array.from(script.matchAll(/^\/\/ @require\s+(\S+)$/gm), (match) => match[1])

function checkAsset(relativePath, url) {
  if (!url) throw new Error(`Missing userscript metadata for ${relativePath}`)
  const parsedUrl = new URL(url)
  if (!parsedUrl.pathname.endsWith(`/${relativePath}`)) {
    throw new Error(`Userscript resource path mismatch: ${url}`)
  }
  const content = fs.readFileSync(path.join(buildRoot, relativePath))
  const digest = createHash("sha256").update(content).digest("hex")
  if (parsedUrl.hash !== `#sha256=${digest}`) {
    throw new Error(`Userscript resource integrity mismatch: ${relativePath}`)
  }
}

for (const [name, { relativePath }] of Object.entries(manifest.resources)) {
  checkAsset(relativePath, resourceUrls[name])
}
for (const { relativePath } of Object.values(manifest.requires)) {
  const url = requireUrls.find((value) => new URL(value).pathname.endsWith(`/${relativePath}`))
  checkAsset(relativePath, url)
}

const characters = Array.from(script).length
if (characters > 2 * 1024 * 1024) {
  throw new Error(`Userscript exceeds Greasy Fork's character limit: ${characters}`)
}
console.log(
  `[check-userscript-build] ${Object.keys(manifest.resources).length} resources and ` +
    `${Object.keys(manifest.requires).length} vendors verified; ${characters} characters`,
)
