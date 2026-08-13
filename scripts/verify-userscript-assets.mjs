#!/usr/bin/env node

/**
 * 发布后核验油猴自托管资产：逐个拉取 commit 锁定的 jsDelivr URL，
 * 与本地构建产物逐字节比对 SHA-256，确保 CDN 上的内容就是本次构建产物。
 * jsDelivr 对新 commit 有传播窗口，拉取失败（网络错误/非 200）按退避重试；
 * 内容摘要不一致属于发布错误，立即失败不重试。
 *
 * 用法：node scripts/verify-userscript-assets.mjs <40-char-commit-sha>
 * （commit 为 userscript-assets 分支发布后的提交，release 工作流自动传入）
 */

import { createHash } from "node:crypto"
import fs from "node:fs"
import path from "node:path"

const USAGE = "Usage: node scripts/verify-userscript-assets.mjs <40-char-commit-sha>"
const BUILD_ROOT = path.resolve("build/userscript")
const MANIFEST_PATH = path.join(BUILD_ROOT, "userscript-assets/manifest.json")

function fail(message) {
  console.error(`verify-userscript-assets: ${message}`)
  process.exit(1)
}

const [, , commit] = process.argv

if (!commit || !/^[0-9a-f]{40}$/i.test(commit)) {
  console.error(USAGE)
  fail(`expected a 40-character git commit SHA, got: ${commit || "(empty)"}`)
}

if (!fs.existsSync(MANIFEST_PATH)) {
  fail(`manifest not found: ${MANIFEST_PATH}; run pnpm build:userscript first`)
}

const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, "utf8"))

const relativePaths = [
  ...Object.values(manifest.resources ?? {}).map(({ relativePath }) => relativePath),
  ...Object.values(manifest.requires ?? {}).map(({ relativePath }) => relativePath),
  "userscript-assets/manifest.json",
].filter(Boolean)

if (relativePaths.length === 0) {
  fail("manifest contains no assets to verify")
}

const baseUrl = `https://cdn.jsdelivr.net/gh/urzeye/ophel@${commit}`

// jsDelivr 新 commit 首次传播通常在秒级；多轮退避覆盖较慢的窗口，
// 每轮只重试尚未成功的资产，避免已通过项重复拉取。
const RETRY_DELAYS_MS = [5_000, 15_000, 30_000, 60_000]

let verified = 0
const mismatches = []
let pending = [...relativePaths]

for (let attempt = 0; ; attempt += 1) {
  const retryLater = []

  for (const relativePath of pending) {
    const localPath = path.join(BUILD_ROOT, relativePath)
    if (!fs.existsSync(localPath)) {
      mismatches.push(`${relativePath}: local file missing`)
      continue
    }

    const url = `${baseUrl}/${relativePath}`
    let remoteBuffer
    try {
      const response = await fetch(url)
      if (!response.ok) {
        retryLater.push([relativePath, `HTTP ${response.status}`])
        continue
      }
      remoteBuffer = Buffer.from(await response.arrayBuffer())
    } catch (error) {
      retryLater.push([relativePath, `fetch failed: ${error.message}`])
      continue
    }

    const localDigest = createHash("sha256").update(fs.readFileSync(localPath)).digest("hex")
    const remoteDigest = createHash("sha256").update(remoteBuffer).digest("hex")

    if (localDigest !== remoteDigest) {
      mismatches.push(
        `${relativePath}: sha256 mismatch (local ${localDigest.slice(0, 12)}…, remote ${remoteDigest.slice(0, 12)}…)`,
      )
      continue
    }

    verified += 1
  }

  if (retryLater.length === 0) {
    break
  }

  if (attempt >= RETRY_DELAYS_MS.length) {
    for (const [relativePath, reason] of retryLater) {
      mismatches.push(`${relativePath}: ${reason}`)
    }
    break
  }

  const delayMs = RETRY_DELAYS_MS[attempt]
  console.log(
    `verify-userscript-assets: ${retryLater.length} asset(s) not reachable yet, ` +
      `retrying in ${delayMs / 1000}s (round ${attempt + 1}/${RETRY_DELAYS_MS.length})`,
  )
  await new Promise((resolve) => setTimeout(resolve, delayMs))
  pending = retryLater.map(([relativePath]) => relativePath)
}

if (mismatches.length > 0) {
  console.error(`verify-userscript-assets: ${mismatches.length} asset(s) failed verification:`)
  for (const mismatch of mismatches) {
    console.error(`  - ${mismatch}`)
  }
  process.exit(1)
}

console.log(
  `verify-userscript-assets: ${verified} asset(s) verified against jsDelivr @${commit.slice(0, 12)}`,
)
