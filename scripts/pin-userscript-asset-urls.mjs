#!/usr/bin/env node

import fs from "node:fs"
import path from "node:path"

const USAGE = "Usage: node scripts/pin-userscript-asset-urls.mjs <40-char-commit-sha> <file...>"
const BRANCH_ASSET_PREFIX = "https://cdn.jsdelivr.net/gh/urzeye/ophel@userscript-assets/"

function fail(message) {
  console.error(`pin-userscript-asset-urls: ${message}`)
  console.error("")
  console.error(USAGE)
  process.exit(1)
}

const [, , commit, ...fileNames] = process.argv

if (!commit || !/^[0-9a-f]{40}$/i.test(commit)) {
  fail(`expected a 40-character git commit SHA, got: ${commit || "(empty)"}`)
}

if (fileNames.length === 0) {
  fail("expected at least one file")
}

const pinnedAssetPrefix = `https://cdn.jsdelivr.net/gh/urzeye/ophel@${commit}/`
let totalReplacements = 0

for (const fileName of fileNames) {
  const filePath = path.resolve(fileName)

  if (!fs.existsSync(filePath)) {
    fail(`file does not exist: ${fileName}`)
  }

  const original = fs.readFileSync(filePath, "utf8")
  const replacements = original.split(BRANCH_ASSET_PREFIX).length - 1

  if (replacements === 0) {
    console.log(`No userscript asset URLs to pin in ${fileName}`)
    continue
  }

  fs.writeFileSync(filePath, original.replaceAll(BRANCH_ASSET_PREFIX, pinnedAssetPrefix))
  totalReplacements += replacements
  console.log(`Pinned ${replacements} userscript asset URL(s) in ${fileName}`)
}

if (totalReplacements === 0) {
  fail("no userscript asset URLs were pinned")
}
