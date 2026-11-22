#!/usr/bin/env node

/**
 * 下载 Ophel 已发布文件：Chrome / Edge 的 CRX、Firefox 的 XPI，以及 GitHub
 * 最新正式 release 的油猴脚本。直接保存原文件，保留商店签名，不重新打包。
 * 油猴脚本没有商店签名；下方仅检查文件格式，验签仍由浏览器负责。
 *
 * 用法：pnpm download:published [chrome edge firefox userscript] [--out-dir <目录>]
 * 默认下载全部来源到仓库根目录 downloads/；重复执行覆盖同名文件。
 */

import { randomUUID } from "node:crypto"
import { mkdir, rename, rm, writeFile } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { parseArgs } from "node:util"

const projectRoot = fileURLToPath(new URL("../", import.meta.url))
const sources = {
  chrome: {
    filename: "ophel-atlas-chrome.crx",
    url:
      "https://clients2.google.com/service/update2/crx?response=redirect" +
      "&prod=chromiumcrx&prodversion=9999.0.9999.0&acceptformat=crx3" +
      "&x=id%3Dlpcohdfbomkgepfladogodgeoppclakd%26uc",
  },
  edge: {
    filename: "ophel-atlas-edge.crx",
    url:
      "https://edge.microsoft.com/extensionwebstorebase/v1/crx?response=redirect" +
      "&x=id%3Dffpenkdeifijngifjmbbpijfpdhlolga%26installsource%3Dondemand%26uc",
  },
  firefox: {
    filename: "ophel-atlas-firefox.xpi",
    url: "https://addons.mozilla.org/firefox/downloads/latest/ophel-ai-chat-enhancer/",
  },
  userscript: {
    filename: "ophel-atlas.user.js",
  },
}

const usage = `Usage: pnpm download:published [sources...] [options]

Sources: chrome edge firefox userscript (default: all)

Options:
  -o, --out-dir <directory>  Output directory (default: <repo>/downloads)
  -h, --help                 Show help

Examples:
  pnpm download:published
  pnpm download:published chrome firefox
  pnpm download:published --out-dir ./downloads/custom

Existing files are replaced only after a successful download and format check.
Store versions may differ while updates are awaiting review.`

async function request(url) {
  const response = await fetch(url, {
    headers: { "User-Agent": "ophel-download-published" },
    signal: AbortSignal.timeout(120_000),
  })
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} ${response.statusText}: ${url}`)
  }
  return response
}

async function getUserscriptUrl() {
  const response = await request("https://api.github.com/repos/urzeye/ophel/releases/latest")
  const release = await response.json()
  const assets = release.assets.filter((asset) => asset.name.endsWith(".user.js"))
  if (assets.length !== 1 || !assets[0].browser_download_url) {
    throw new Error(`Expected exactly one .user.js asset in release ${release.tag_name}`)
  }
  console.log(`[userscript] GitHub release ${release.tag_name}: ${assets[0].name}`)
  return assets[0].browser_download_url
}

function checkFormat(filename, data) {
  if (data.length === 0) throw new Error("Downloaded file is empty")

  if (filename.endsWith(".crx")) {
    if (data.length < 12 || data.toString("ascii", 0, 4) !== "Cr24" || data.readUInt32LE(4) !== 3) {
      throw new Error("Expected a CRX3 package")
    }
    return
  }

  if (filename.endsWith(".xpi")) {
    if (data.length < 4 || data.readUInt32LE(0) !== 0x04034b50) {
      throw new Error("Expected an XPI (ZIP) package")
    }
    return
  }

  const metadata = data.subarray(0, 64 * 1024).toString("utf8")
  if (
    !/^\/\/ ==UserScript==\r?$/m.test(metadata) ||
    !/^\/\/ ==\/UserScript==\r?$/m.test(metadata)
  ) {
    throw new Error("Expected a userscript with a complete metadata block")
  }
}

async function download(name, outputDir) {
  const source = sources[name]
  console.log(`[${name}] Downloading ${source.filename}...`)
  const url = source.url ?? (await getUserscriptUrl())
  const response = await request(url)
  const data = Buffer.from(await response.arrayBuffer())
  checkFormat(source.filename, data)

  const destination = path.join(outputDir, source.filename)
  const temporaryPath = `${destination}.${randomUUID()}.part`
  try {
    await writeFile(temporaryPath, data, { flag: "wx" })
    await rename(temporaryPath, destination)
  } finally {
    await rm(temporaryPath, { force: true })
  }
  console.log(`[${name}] Saved ${destination} (${(data.length / 1024 / 1024).toFixed(2)} MB)`)
}

async function main() {
  const { values, positionals } = parseArgs({
    options: {
      "out-dir": { type: "string", short: "o" },
      help: { type: "boolean", short: "h" },
    },
    allowPositionals: true,
  })
  if (values.help) {
    console.log(usage)
    return
  }

  const selected = [...new Set(positionals.length ? positionals : Object.keys(sources))]
  for (const name of selected) {
    if (!Object.hasOwn(sources, name)) {
      throw new Error(`Unknown source: ${name}. Choose from: ${Object.keys(sources).join(", ")}`)
    }
  }
  if (values["out-dir"] !== undefined && !values["out-dir"].trim()) {
    throw new Error("--out-dir must not be empty")
  }
  const outputDir = path.resolve(values["out-dir"] ?? path.join(projectRoot, "downloads"))
  await mkdir(outputDir, { recursive: true })
  console.log(`Output: ${outputDir}`)

  const failed = []
  for (const name of selected) {
    try {
      await download(name, outputDir)
    } catch (error) {
      failed.push(name)
      console.error(`[${name}] Failed: ${error.message}`)
      if (error.cause) console.error(`  ${error.cause.message}`)
    }
  }

  console.log(`\nDownloaded ${selected.length - failed.length}/${selected.length} files.`)
  if (failed.length > 0) {
    throw new Error(`Failed sources: ${failed.join(", ")}`)
  }
}

main().catch((error) => {
  console.error(`download-published: ${error.message}`)
  process.exitCode = 1
})
