import fs from "node:fs"
import path from "node:path"
import process from "node:process"
import { gzipSync } from "node:zlib"

const rootDir = process.cwd()
const chromeBuildDir = path.join(rootDir, "build", "chrome-mv3-prod")
const userscriptFile = path.join(rootDir, "build", "userscript", "ophel.user.js")

const AUDIT_CONTENT_ENTRY_BASELINE_RAW = 7_494_836
const MINIMUM_CONTENT_ENTRY_REDUCTION = 0.4
const budgets = {
  contentEntries: { raw: 4_100_000, gzip: 1_150_000 },
  siteEntry: { raw: 1_100_000, gzip: 300_000 },
  userscript: { raw: 2_100_000, gzip: 550_000 },
}

function formatBytes(bytes) {
  return `${(bytes / 1024).toFixed(1)} KiB`
}

function readRequiredFile(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Missing build artifact: ${path.relative(rootDir, filePath)}`)
  }
  return fs.readFileSync(filePath)
}

function findSingleFile(directory, pattern, label) {
  if (!fs.existsSync(directory)) {
    throw new Error(`Missing build directory: ${path.relative(rootDir, directory)}`)
  }

  const matches = fs.readdirSync(directory).filter((fileName) => pattern.test(fileName))
  if (matches.length !== 1) {
    throw new Error(`Expected one ${label} artifact, found ${matches.length}`)
  }
  return path.join(directory, matches[0])
}

function findFiles(directory, pattern, label) {
  if (!fs.existsSync(directory)) {
    throw new Error(`Missing build directory: ${path.relative(rootDir, directory)}`)
  }

  const matches = fs.readdirSync(directory).filter((fileName) => pattern.test(fileName))
  if (matches.length === 0) {
    throw new Error(`Expected at least one ${label} artifact, found none`)
  }
  return matches.map((fileName) => path.join(directory, fileName))
}

function measure(filePath) {
  const content = readRequiredFile(filePath)
  return {
    filePath,
    raw: content.byteLength,
    gzip: gzipSync(content, { level: 9 }).byteLength,
  }
}

function assertBudget(label, measurement, budget) {
  const failures = []
  if (measurement.raw > budget.raw) {
    failures.push(`raw ${formatBytes(measurement.raw)} > ${formatBytes(budget.raw)}`)
  }
  if (measurement.gzip > budget.gzip) {
    failures.push(`gzip ${formatBytes(measurement.gzip)} > ${formatBytes(budget.gzip)}`)
  }
  if (failures.length > 0) {
    throw new Error(`${label} exceeds bundle budget: ${failures.join(", ")}`)
  }
}

try {
  const main = measure(findSingleFile(chromeBuildDir, /^main\.[^.]+\.js$/, "main content entry"))
  const siteEntries = findFiles(
    chromeBuildDir,
    /^site-[^.]+\.[^.]+\.js$/,
    "site content entry",
  ).map(measure)
  const uiEntry = measure(
    findSingleFile(chromeBuildDir, /^ui-entry\.[^.]+\.js$/, "UI content entry"),
  )
  const userscript = measure(userscriptFile)
  const largestSiteEntry = siteEntries.reduce((largest, entry) =>
    entry.raw > largest.raw ? entry : largest,
  )
  const contentEntries = {
    raw: main.raw + uiEntry.raw,
    gzip: main.gzip + uiEntry.gzip,
  }

  const manifest = JSON.parse(
    readRequiredFile(path.join(chromeBuildDir, "manifest.json")).toString("utf8"),
  )
  const runtimeBusinessScripts = (manifest.web_accessible_resources || [])
    .flatMap((entry) => entry.resources || [])
    .filter((resource) => resource.endsWith(".js") && !resource.startsWith("assets/"))

  if (runtimeBusinessScripts.length > 0) {
    throw new Error(
      `Content scripts expose runtime-loaded JS chunks: ${runtimeBusinessScripts.join(", ")}`,
    )
  }

  for (const entry of [main, ...siteEntries, uiEntry]) {
    const source = readRequiredFile(entry.filePath).toString("utf8")
    if (source.includes(".bundle.root(")) {
      throw new Error(
        `${path.basename(entry.filePath)} contains a runtime JS chunk lookup from a content script`,
      )
    }

    if (
      path.basename(entry.filePath).startsWith("site-") &&
      !source.includes("ophel:adapter-runtime-change")
    ) {
      throw new Error(
        `${path.basename(entry.filePath)} does not register its site adapter in the shared runtime`,
      )
    }
  }

  assertBudget("Extension content entries", contentEntries, budgets.contentEntries)
  assertBudget("Largest site adapter entry", largestSiteEntry, budgets.siteEntry)
  assertBudget("Userscript", userscript, budgets.userscript)

  const reduction = 1 - contentEntries.raw / AUDIT_CONTENT_ENTRY_BASELINE_RAW
  if (reduction < MINIMUM_CONTENT_ENTRY_REDUCTION) {
    throw new Error(
      `Content entry reduction ${(reduction * 100).toFixed(1)}% is below ${(MINIMUM_CONTENT_ENTRY_REDUCTION * 100).toFixed(0)}%`,
    )
  }

  console.log(
    `[bundle-budget] content entries ${formatBytes(contentEntries.raw)} raw / ${formatBytes(contentEntries.gzip)} gzip (${(reduction * 100).toFixed(1)}% below audit baseline)`,
  )
  console.log(
    `[bundle-budget] largest site entry ${path.basename(largestSiteEntry.filePath)} ${formatBytes(largestSiteEntry.raw)} raw / ${formatBytes(largestSiteEntry.gzip)} gzip`,
  )
  console.log(
    `[bundle-budget] userscript ${formatBytes(userscript.raw)} raw / ${formatBytes(userscript.gzip)} gzip`,
  )
} catch (error) {
  console.error(`[bundle-budget] ${error instanceof Error ? error.message : String(error)}`)
  process.exit(1)
}
