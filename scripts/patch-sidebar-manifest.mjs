/**
 * Patch browser-specific sidebar manifest fields.
 *
 * Chromium targets use `side_panel` plus the `sidePanel` permission.
 * Firefox targets use `sidebar_action` and must not keep Chromium-only fields.
 *
 * Usage:
 *   node scripts/patch-sidebar-manifest.mjs <build-dir> <chromium|firefox>
 */

import fs from "fs"
import path from "path"

const buildDir = process.argv[2]
const target = process.argv[3]

if (!buildDir || !target) {
  console.error(
    "[patch-sidebar-manifest] Usage: node scripts/patch-sidebar-manifest.mjs <build-dir> <chromium|firefox>",
  )
  process.exit(1)
}

if (target !== "chromium" && target !== "firefox") {
  console.error(`[patch-sidebar-manifest] Unsupported target: ${target}`)
  process.exit(1)
}

const manifestPath = path.join(buildDir, "manifest.json")
if (!fs.existsSync(manifestPath)) {
  console.error(`[patch-sidebar-manifest] manifest.json not found in: ${buildDir}`)
  process.exit(1)
}

const sidepanelPath = path.join(buildDir, "sidepanel.html")
if (!fs.existsSync(sidepanelPath)) {
  console.error(`[patch-sidebar-manifest] sidepanel.html not found in: ${buildDir}`)
  process.exit(1)
}

const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"))

function ensurePermission(permission) {
  const permissions = Array.isArray(manifest.permissions) ? manifest.permissions : []
  if (!permissions.includes(permission)) {
    permissions.push(permission)
  }
  manifest.permissions = permissions
}

function removePermission(permission) {
  if (!Array.isArray(manifest.permissions)) return
  manifest.permissions = manifest.permissions.filter((item) => item !== permission)
}

function resolveDefaultIcon() {
  const actionIcon = manifest.action?.default_icon
  if (actionIcon && typeof actionIcon === "object" && !Array.isArray(actionIcon)) {
    return actionIcon
  }

  const icons = manifest.icons
  if (icons && typeof icons === "object" && !Array.isArray(icons)) {
    return icons
  }

  return undefined
}

if (target === "chromium") {
  delete manifest.sidebar_action
  ensurePermission("sidePanel")
  manifest.side_panel = {
    default_path: "sidepanel.html",
  }
  console.log("[patch-sidebar-manifest] Patched Chromium side_panel.")
} else {
  delete manifest.side_panel
  removePermission("sidePanel")
  manifest.sidebar_action = {
    default_title:
      typeof manifest.name === "string" && manifest.name.startsWith("__MSG_")
        ? "Ophel Atlas"
        : manifest.name || "Ophel Atlas",
    default_panel: "sidepanel.html",
    default_icon: resolveDefaultIcon(),
  }
  console.log("[patch-sidebar-manifest] Patched Firefox sidebar_action.")
}

fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n")
console.log("[patch-sidebar-manifest] Manifest written successfully.")
