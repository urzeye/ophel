import fs from "node:fs"
import os from "node:os"
import path from "node:path"

import { afterEach, beforeEach, expect, it } from "vitest"

import { verifySafariBuild } from "../../scripts/verify-safari-build.mjs"

let root
let scaffold
let manifest
const writeManifest = () =>
  fs.writeFileSync(path.join(root, "manifest.json"), JSON.stringify(manifest))

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "ophel-safari-build-"))
  fs.mkdirSync(path.join(root, "tabs"))
  for (const name of [
    "background.js",
    "popup.html",
    "main.js",
    "tabs/options.html",
    "tabs/perm-request.html",
    "monitor-entry.123.js",
  ]) {
    fs.writeFileSync(path.join(root, name), "")
  }
  fs.writeFileSync(
    path.join(root, "background.js"),
    'registerContentScripts({id:"srcContentsMonitorEntry",js:["monitor-entry.123.js"]})',
  )
  scaffold = path.join(root, "scaffold.ts")
  fs.writeFileSync(
    scaffold,
    'import srcContentsMonitorEntry from "url:../../../src/contents/monitor-entry"',
  )
  manifest = {
    version: "1.0.0",
    manifest_version: 3,
    permissions: ["storage", "alarms", "scripting", "unlimitedStorage"],
    optional_permissions: ["cookies"],
    optional_host_permissions: ["<all_urls>"],
    background: { service_worker: "background.js" },
    action: { default_popup: "popup.html" },
    content_scripts: [{ matches: ["https://example.com/*"], js: ["main.js"] }],
  }
  writeManifest()
})
afterEach(() => {
  const target = fs.realpathSync(root)
  expect(path.dirname(target)).toBe(fs.realpathSync(os.tmpdir()))
  expect(path.basename(target).startsWith("ophel-safari-build-")).toBe(true)
  fs.rmSync(target, { recursive: true, force: true })
})

it("validates a complete Safari fixture", () => {
  expect(verifySafariBuild(root, scaffold)).toEqual({ version: "1.0.0", mainWorldEntries: 1 })
})
it.each(["declarativeNetRequest", "declarativeNetRequestWithHostAccess", "notifications"])(
  "rejects forbidden permission %s",
  (permission) => {
    manifest.optional_permissions.push(permission)
    writeManifest()
    expect(() => verifySafariBuild(root, scaffold)).toThrow()
  },
)
it("rejects a missing script referenced by the manifest", () => {
  fs.unlinkSync(path.join(root, "main.js"))
  expect(() => verifySafariBuild(root, scaffold)).toThrow()
})
it("rejects missing MAIN world assets even when the manifest looks valid", () => {
  fs.unlinkSync(path.join(root, "monitor-entry.123.js"))
  expect(() => verifySafariBuild(root, scaffold)).toThrow(/MAIN world bundle/)
})
it("rejects an empty MAIN world scaffold", () => {
  fs.writeFileSync(scaffold, "")
  expect(() => verifySafariBuild(root, scaffold)).toThrow(/scaffold is empty/)
})
it("rejects Chrome signing keys", () => {
  manifest.key = "chrome-key"
  writeManifest()
  expect(() => verifySafariBuild(root, scaffold)).toThrow(/Chrome key/)
})
it("fails for an empty build directory", () => {
  fs.unlinkSync(path.join(root, "manifest.json"))
  expect(() => verifySafariBuild(root, scaffold)).toThrow()
})
