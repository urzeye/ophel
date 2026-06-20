#!/usr/bin/env node

import fs from "node:fs"
import path from "node:path"

import {
  RELEASE_NOTES_OUTPUT_FILE,
  buildReleaseNotesModuleFromFiles,
} from "./release-notes-utils.mjs"

const PROJECT_ROOT = process.cwd()
const PACKAGE_JSON = path.join(PROJECT_ROOT, "package.json")

function fail(message) {
  console.error(`sync-release-notes: ${message}`)
  process.exit(1)
}

function readPackageVersion() {
  return JSON.parse(fs.readFileSync(PACKAGE_JSON, "utf8")).version
}

function normalizeVersion(input) {
  const version = input.startsWith("v") ? input.slice(1) : input

  if (version === "Unreleased") {
    fail("[Unreleased] is not a released version")
  }

  if (!/^\d+\.\d+\.\d+$/.test(version)) {
    fail(`Version must be x.y.z or vx.y.z, got: ${input}`)
  }

  return version
}

const version = normalizeVersion(process.argv[2] || readPackageVersion())
const outputPath = path.join(PROJECT_ROOT, RELEASE_NOTES_OUTPUT_FILE)
const moduleContent = buildReleaseNotesModuleFromFiles(PROJECT_ROOT, version)

fs.mkdirSync(path.dirname(outputPath), { recursive: true })
fs.writeFileSync(outputPath, moduleContent, "utf8")

console.log(`Synced ${RELEASE_NOTES_OUTPUT_FILE} from changelog version ${version}`)
