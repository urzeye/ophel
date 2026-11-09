import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")

const collectFiles = (directory) =>
  fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(directory, entry.name)
    return entry.isDirectory() ? collectFiles(entryPath) : [entryPath]
  })

/** 验证实际产物的权限和引用完整性；不代替 Safari 的注册、时序和页面验收。 */
export function verifySafariBuild(
  buildDirectory,
  scaffoldPath = path.join(projectRoot, ".plasmo/static/background/main-world-scripts.ts"),
) {
  assert(buildDirectory, "Usage: node scripts/verify-safari-build.mjs <build-dir>")
  const root = path.resolve(buildDirectory)
  const manifest = JSON.parse(fs.readFileSync(path.join(root, "manifest.json"), "utf8"))
  assert.equal(manifest.manifest_version, 3, "Safari requires the MV3 build")
  assert(Array.isArray(manifest.permissions), "Missing required permissions")
  for (const permission of ["storage", "scripting", "alarms", "unlimitedStorage"]) {
    assert(manifest.permissions.includes(permission), `Missing permission: ${permission}`)
  }
  const permissions = [...manifest.permissions, ...(manifest.optional_permissions ?? [])]
  assert(
    !permissions.some((value) => value.startsWith("declarativeNetRequest")),
    "DNR must be disabled",
  )
  assert(!permissions.includes("notifications"), "System notification permission must be absent")
  assert(!Object.hasOwn(manifest, "key"), "Chrome key must be removed")
  assert(
    manifest.optional_host_permissions?.includes("<all_urls>"),
    "SitePack authorization is missing",
  )
  assert(
    manifest.optional_permissions?.includes("cookies"),
    "Cookie permission must remain optional",
  )

  const requireFile = (reference) => {
    assert(typeof reference === "string" && reference.length > 0, "Missing resource reference")
    const resolved = path.resolve(root, reference)
    const relative = path.relative(root, resolved)
    assert(
      !relative.startsWith("..") && !path.isAbsolute(relative),
      `Resource outside build: ${reference}`,
    )
    assert(fs.statSync(resolved).isFile(), `Missing file: ${reference}`)
    return resolved
  }
  const background = fs.readFileSync(requireFile(manifest.background?.service_worker), "utf8")
  requireFile(manifest.action?.default_popup)
  requireFile("tabs/options.html")
  requireFile("tabs/perm-request.html")
  assert(manifest.content_scripts?.length > 0, "Content scripts are missing")
  for (const script of manifest.content_scripts) {
    assert(script.matches?.length > 0, "Content script match patterns are missing")
    for (const reference of [...(script.js ?? []), ...(script.css ?? [])]) requireFile(reference)
  }
  for (const resource of manifest.web_accessible_resources ?? []) {
    for (const reference of resource.resources) {
      if (!reference.includes("*") && !reference.startsWith("__MSG_")) requireFile(reference)
    }
  }

  // 入口来源复用 Plasmo 的生成清单，不另维护一套 MAIN world 脚本列表。
  const scaffold = fs.readFileSync(scaffoldPath, "utf8")
  const entries = [...scaffold.matchAll(/^import (\w+) from "url:([^"\r\n]+)"/gm)]
  assert(entries.length > 0, "MAIN world entry scaffold is empty")
  assert(background.includes("registerContentScripts"), "MAIN world registration is missing")
  const files = collectFiles(root)
  for (const [, id, source] of entries) {
    const stem = path.basename(source)
    assert(background.includes(id), `Missing MAIN world registration: ${id}`)
    assert(
      files.some((file) => {
        const name = path.basename(file)
        return name.startsWith(`${stem}.`) && name.endsWith(".js") && background.includes(name)
      }),
      `Missing MAIN world bundle reference: ${stem}`,
    )
  }
  return { version: manifest.version, mainWorldEntries: entries.length }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = verifySafariBuild(process.argv[2])
  console.log(
    `[verify-safari-build] OK: v${result.version}, ${result.mainWorldEntries} MAIN world entries`,
  )
}
