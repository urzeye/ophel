#!/usr/bin/env node

import { execFileSync } from "node:child_process"
import fs from "node:fs"
import path from "node:path"

import {
  RELEASE_NOTES_OUTPUT_FILE,
  buildReleaseNotesModule,
  readReleaseNotesMediaFromFiles,
} from "./release-notes-utils.mjs"

const PROJECT_ROOT = process.cwd()
const PACKAGE_JSON = path.join(PROJECT_ROOT, "package.json")
const CHANGELOGS = ["CHANGELOG.md", "CHANGELOG.zh-CN.md"]
const RELEASE_FILES = ["package.json", ...CHANGELOGS, RELEASE_NOTES_OUTPUT_FILE]
const RELEASE_BRANCH = "main"
const REPO_RELEASE_URL = "https://github.com/urzeye/ophel/releases/tag"

const USAGE = `Usage:
  pnpm release [version] [--dry-run] [--no-push]
  pnpm release:redo <version> [--yes] [--dry-run] [--skip-github-release]

Examples:
  pnpm release
  pnpm release 1.0.52
  pnpm release v1.0.52
  pnpm release -- --dry-run
  pnpm release 1.0.52 -- --no-push
  pnpm release:redo v1.0.52 -- --dry-run
  pnpm release:redo v1.0.52 -- --yes
`

function parseArgs(argv) {
  const cleanArgv = argv.filter((arg) => arg !== "--")
  if (cleanArgv[0] === "redo") {
    return parseRedoArgs(cleanArgv.slice(1))
  }

  return parseReleaseArgs(cleanArgv)
}

function parseReleaseArgs(argv) {
  const options = {
    command: "release",
    dryRun: false,
    noPush: false,
    help: false,
  }
  const values = []

  for (const arg of argv) {
    if (arg === "--dry-run") {
      options.dryRun = true
    } else if (arg === "--no-push") {
      options.noPush = true
    } else if (arg === "--help" || arg === "-h") {
      options.help = true
    } else if (arg.startsWith("-")) {
      fail(`Unknown option: ${arg}`)
    } else {
      values.push(arg)
    }
  }

  if (values.length > 1) {
    fail(`Expected at most one version, got: ${values.join(", ")}`)
  }

  return {
    ...options,
    requestedVersion: values[0] ?? null,
  }
}

function parseRedoArgs(argv) {
  const options = {
    command: "redo",
    dryRun: false,
    yes: false,
    skipGithubRelease: false,
    help: false,
  }
  const values = []

  for (const arg of argv) {
    if (arg === "--dry-run") {
      options.dryRun = true
    } else if (arg === "--yes") {
      options.yes = true
    } else if (arg === "--skip-github-release") {
      options.skipGithubRelease = true
    } else if (arg === "--help" || arg === "-h") {
      options.help = true
    } else if (arg.startsWith("-")) {
      fail(`Unknown option: ${arg}`)
    } else {
      values.push(arg)
    }
  }

  if (values.length !== 1 && !options.help) {
    fail("release:redo requires exactly one version")
  }

  return {
    ...options,
    requestedVersion: values[0] ?? null,
  }
}

function fail(message) {
  console.error(`release: ${message}`)
  console.error("")
  console.error(USAGE.trimEnd())
  process.exit(1)
}

function git(args, options = {}) {
  const output = execFileSync("git", args, {
    cwd: PROJECT_ROOT,
    encoding: "utf8",
    stdio: options.stdio ?? ["ignore", "pipe", "pipe"],
  })

  return output ? String(output).trim() : ""
}

function commandExists(command) {
  try {
    execFileSync(command, ["--version"], {
      cwd: PROJECT_ROOT,
      encoding: "utf8",
      stdio: ["ignore", "ignore", "ignore"],
    })
    return true
  } catch {
    return false
  }
}

function runCommand(command, args, options = {}) {
  const output = execFileSync(command, args, {
    cwd: PROJECT_ROOT,
    encoding: "utf8",
    stdio: options.stdio ?? ["ignore", "pipe", "pipe"],
  })

  return output ? String(output).trim() : ""
}

function readPackageJson() {
  return JSON.parse(fs.readFileSync(PACKAGE_JSON, "utf8"))
}

function serializePackageJson(packageJson) {
  return `${JSON.stringify(packageJson, null, 2)}\n`
}

function normalizeVersion(input) {
  const version = input.startsWith("v") ? input.slice(1) : input
  if (!/^\d+\.\d+\.\d+$/.test(version)) {
    fail(`Version must be x.y.z or vx.y.z, got: ${input}`)
  }
  return version
}

function bumpPatch(version) {
  const [major, minor, patch] = normalizeVersion(version)
    .split(".")
    .map((part) => Number.parseInt(part, 10))

  return `${major}.${minor}.${patch + 1}`
}

function today() {
  const now = new Date()
  const month = String(now.getMonth() + 1).padStart(2, "0")
  const day = String(now.getDate()).padStart(2, "0")

  return `${now.getFullYear()}-${month}-${day}`
}

function stripUnreleasedSeparators(content) {
  const lines = content.replace(/\s+$/u, "").split("\n")

  while (lines.length > 0 && lines[0].trim() === "") {
    lines.shift()
  }

  while (lines.length > 0 && lines.at(-1).trim() === "") {
    lines.pop()
  }

  if (lines.at(-1)?.trim() === "---") {
    lines.pop()
  }

  while (lines.length > 0 && lines.at(-1).trim() === "") {
    lines.pop()
  }

  return lines.join("\n")
}

function updateChangelog(fileName, version, date) {
  const filePath = path.join(PROJECT_ROOT, fileName)
  const original = fs.readFileSync(filePath, "utf8")
  const sections = getChangelogSections(original, fileName)
  const unreleasedBody = stripUnreleasedSeparators(sections.unreleasedContent)
  const hasVersion = hasChangelogVersion(original, version)

  if (hasVersion) {
    if (!unreleasedBody) {
      return addReleaseReference(original, version)
    }

    const withoutUnreleased =
      original.slice(0, sections.afterUnreleased) +
      "\n\n---\n\n" +
      original.slice(sections.nextVersionStart)

    return addReleaseReference(
      insertIntoExistingVersion(withoutUnreleased, version, unreleasedBody),
      version,
    )
  }

  if (!unreleasedBody) {
    fail(`${fileName} has no unreleased content to release`)
  }

  const heading = `## [${version}] - ${date}`
  const updated =
    original.slice(0, sections.afterUnreleased) +
    `\n\n---\n\n${heading}\n\n${unreleasedBody}\n\n---\n\n` +
    original.slice(sections.nextVersionStart)

  return addReleaseReference(updated, version)
}

function getChangelogSections(content, fileName) {
  const unreleasedMatch = content.match(/^## \[Unreleased\][^\S\r\n]*$/mu)

  if (!unreleasedMatch || unreleasedMatch.index === undefined) {
    fail(`${fileName} is missing "## [Unreleased]"`)
  }

  const afterUnreleased = unreleasedMatch.index + unreleasedMatch[0].length
  const nextVersionMatch = content.slice(afterUnreleased).match(/\n## \[[^\]]+\](?:[^\n]*)?\n/u)

  if (!nextVersionMatch || nextVersionMatch.index === undefined) {
    fail(`${fileName} has no released version after "## [Unreleased]"`)
  }

  const nextVersionStart = afterUnreleased + nextVersionMatch.index + 1

  return {
    afterUnreleased,
    nextVersionStart,
    unreleasedContent: content.slice(afterUnreleased, nextVersionStart),
  }
}

function hasChangelogVersion(content, version) {
  return new RegExp(`^## \\[${escapeRegExp(version)}\\](?:[^\\n]*)?$`, "mu").test(content)
}

function insertIntoExistingVersion(content, version, body) {
  const versionHeadingMatch = content.match(
    new RegExp(`^## \\[${escapeRegExp(version)}\\](?:[^\\n]*)?\\n`, "mu"),
  )

  if (!versionHeadingMatch || versionHeadingMatch.index === undefined) {
    fail(`Changelog is missing existing section for ${version}`)
  }

  const insertAt = versionHeadingMatch.index + versionHeadingMatch[0].length
  const afterHeading = content.slice(insertAt).replace(/^\n+/u, "")

  return `${content.slice(0, insertAt)}\n${body}\n\n${afterHeading}`
}

function addReleaseReference(content, version) {
  const reference = `[${version}]: ${REPO_RELEASE_URL}/v${version}`

  if (content.includes(reference)) {
    return content
  }

  if (content.match(new RegExp(`^\\[${escapeRegExp(version)}\\]:`, "mu"))) {
    fail(`Changelog already has a [${version}] reference with a different URL`)
  }

  const firstReferenceMatch = content.match(/^\[\d+\.\d+\.\d+\]: .+$/mu)
  if (!firstReferenceMatch || firstReferenceMatch.index === undefined) {
    return `${content.trimEnd()}\n\n${reference}\n`
  }

  return (
    content.slice(0, firstReferenceMatch.index) +
    `${reference}\n` +
    content.slice(firstReferenceMatch.index)
  )
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

function assertGitState(options) {
  git(["rev-parse", "--is-inside-work-tree"])

  const branch = git(["branch", "--show-current"])
  if (branch !== RELEASE_BRANCH) {
    fail(`Release must run on ${RELEASE_BRANCH}; current branch is ${branch}`)
  }

  if (!options.dryRun) {
    const status = git(["status", "--porcelain"])
    if (status) {
      fail("Working tree must be clean before running a release")
    }
  }
}

function assertTagDoesNotExist(tagName) {
  const existing = git(["tag", "--list", tagName])
  if (existing) {
    fail(`Tag already exists locally: ${tagName}`)
  }
}

function localTagExists(tagName) {
  return Boolean(git(["tag", "--list", tagName]))
}

function getReleaseFileUpdates(packageJson, changelogs, releaseNotesModule) {
  const updates = new Map([
    ["package.json", serializePackageJson(packageJson)],
    ...changelogs,
    [RELEASE_NOTES_OUTPUT_FILE, releaseNotesModule],
  ])

  const changedFiles = [...updates].flatMap(([fileName, content]) => {
    const current = fs.readFileSync(path.join(PROJECT_ROOT, fileName), "utf8")
    return current === content ? [] : [fileName]
  })

  return { updates, changedFiles }
}

function writeReleaseFiles(updates) {
  for (const [fileName, content] of updates) {
    const filePath = path.join(PROJECT_ROOT, fileName)
    fs.mkdirSync(path.dirname(filePath), { recursive: true })
    fs.writeFileSync(filePath, content)
  }
}

function runRelease(version, options) {
  const tagName = `v${version}`
  const packageJson = readPackageJson()
  const previousVersion = packageJson.version
  const releaseDate = today()

  packageJson.version = version

  const changelogs = new Map(
    CHANGELOGS.map((fileName) => [fileName, updateChangelog(fileName, version, releaseDate)]),
  )
  const releaseNotesModule = buildReleaseNotesModule({
    version,
    enChangelog: changelogs.get("CHANGELOG.md"),
    zhChangelog: changelogs.get("CHANGELOG.zh-CN.md"),
    media: readReleaseNotesMediaFromFiles(PROJECT_ROOT, version),
  })
  const { updates, changedFiles } = getReleaseFileUpdates(
    packageJson,
    changelogs,
    releaseNotesModule,
  )

  console.log(`Release ${previousVersion} -> ${version} (${tagName})`)
  console.log(`Date: ${releaseDate}`)
  console.log(`Files: ${RELEASE_FILES.join(", ")}`)
  if (changedFiles.length === 0) {
    console.log("Release files are already up to date; tagging current HEAD.")
  }

  if (options.dryRun) {
    console.log("")
    console.log("Dry run: no files, commits, tags, or pushes were changed.")
    if (changedFiles.length > 0) {
      console.log(`Would update: ${changedFiles.join(", ")}`)
      console.log(`Would commit: chore: release ${tagName}`)
    } else {
      console.log("Would skip release commit.")
    }
    console.log(
      options.noPush
        ? `Would create local tag: ${tagName}`
        : `Would push: origin ${RELEASE_BRANCH} ${tagName}`,
    )
    return
  }

  if (changedFiles.length > 0) {
    writeReleaseFiles(updates)
    git(["add", ...RELEASE_FILES], { stdio: "inherit" })
    git(["commit", "-m", `chore: release ${tagName}`], { stdio: "inherit" })
  }

  git(["tag", tagName], { stdio: "inherit" })

  if (options.noPush) {
    console.log(`Created local tag ${tagName}.`)
    return
  }

  git(["push", "origin", RELEASE_BRANCH, tagName], { stdio: "inherit" })
}

function gh(args, options = {}) {
  return runCommand("gh", args, options)
}

function deleteGithubRelease(tagName, options) {
  if (options.skipGithubRelease) {
    console.log("Skipping GitHub Release deletion.")
    return
  }

  if (!commandExists("gh")) {
    fail(
      "GitHub CLI is required to delete the GitHub Release. Install/authenticate gh, or pass --skip-github-release if no release exists.",
    )
  }

  try {
    const output = gh(["release", "delete", tagName, "--yes"])
    if (output) {
      console.log(output)
    }
    console.log(`Deleted GitHub Release: ${tagName}`)
  } catch (error) {
    const stderr = String(error.stderr ?? "")
    if (stderr.toLowerCase().includes("not found")) {
      console.log(`GitHub Release not found: ${tagName}`)
      return
    }
    throw error
  }
}

function deleteRemoteTag(tagName) {
  try {
    const output = git(["push", "origin", "--delete", tagName])
    if (output) {
      console.log(output)
    }
    console.log(`Deleted remote tag: ${tagName}`)
  } catch (error) {
    const stderr = String(error.stderr ?? "")
    if (stderr.includes("remote ref does not exist")) {
      console.log(`Remote tag not found: ${tagName}`)
      return
    }
    throw error
  }
}

function deleteLocalTag(tagName) {
  if (!localTagExists(tagName)) {
    console.log(`Local tag not found: ${tagName}`)
    return
  }

  git(["tag", "-d", tagName], { stdio: "inherit" })
}

function runRedo(version, options) {
  const tagName = `v${version}`

  console.log(`Redo release cleanup for ${tagName}`)
  console.log("Targets: GitHub Release, origin tag, local tag")

  if (options.dryRun || !options.yes) {
    console.log("")
    console.log("Dry run: no releases or tags were deleted.")
    console.log("Pass --yes to delete the GitHub Release and tags.")
    return
  }

  deleteGithubRelease(tagName, options)
  deleteRemoteTag(tagName)
  deleteLocalTag(tagName)
}

const options = parseArgs(process.argv.slice(2))
if (options.help) {
  console.log(USAGE.trimEnd())
  process.exit(0)
}

if (options.command === "redo") {
  git(["rev-parse", "--is-inside-work-tree"])
  runRedo(normalizeVersion(options.requestedVersion), options)
} else {
  assertGitState(options)

  const packageJson = readPackageJson()
  const version = options.requestedVersion
    ? normalizeVersion(options.requestedVersion)
    : bumpPatch(packageJson.version)

  assertTagDoesNotExist(`v${version}`)
  runRelease(version, options)
}
