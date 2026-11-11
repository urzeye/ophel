/**
 * 生成扩展端打包外置的语言资源 JSON（assets/locales/messages.json）
 *
 * 背景：11 种语言的内联资源约 1.1MB，打进每个 JS bundle（main / ui-entry /
 * popup / options / perm-request）会显著放大产物体积，并触发 Firefox AMO
 * "file is too large to parse"（单文件 5MB 解析上限）。构建期把全部语言资源
 * 序列化为独立 JSON（UTF-8、无 BOM），运行时由 src/utils/i18n.ts 经
 * chrome.runtime.getURL + fetch 一次性加载；en 仍静态打进 bundle 作兜底。
 *
 * 单一数据源仍是 src/locales/<lang>/index.ts，本脚本只导出快照；
 * 由 dev / build 等 npm script 在执行前自动调用（见 package.json）。
 * 内容未变化时跳过写入，避免污染工作区。
 */
import fs from "node:fs"
import path from "node:path"
import process from "node:process"

import { resources } from "../src/locales/resources"

const projectRoot = process.cwd()
const targetPath = path.resolve(projectRoot, "assets/locales/messages.json")

const content = JSON.stringify(resources)

const currentContent = fs.existsSync(targetPath) ? fs.readFileSync(targetPath, "utf-8") : null

if (currentContent !== content) {
  fs.mkdirSync(path.dirname(targetPath), { recursive: true })
  fs.writeFileSync(targetPath, content, "utf-8")
  console.log(
    `[prepare-locale-assets] Wrote assets/locales/messages.json (${Buffer.byteLength(content, "utf8")} bytes)`,
  )
} else {
  console.log("[prepare-locale-assets] assets/locales/messages.json is up to date")
}

// 同步已存在的构建目录，避免开发中修改文案后需重启 plasmo dev
const buildDirs = [
  "build/chrome-mv3-dev",
  "build/firefox-mv3-dev",
  "build/chrome-mv3-prod",
  "build/firefox-mv3-prod",
]
for (const dir of buildDirs) {
  const buildTarget = path.resolve(projectRoot, dir, "assets/locales/messages.json")
  if (fs.existsSync(path.dirname(buildTarget))) {
    const existing = fs.existsSync(buildTarget) ? fs.readFileSync(buildTarget, "utf-8") : null
    if (existing !== content) {
      fs.writeFileSync(buildTarget, content, "utf-8")
      console.log(`[prepare-locale-assets] Synced to ${dir}/assets/locales/messages.json`)
    }
  }
}
