/**
 * Patch Edge Add-ons Store locales
 *
 * Replaces extensionName in all _locales/<lang>/messages.json with shorter,
 * Edge-store-compliant titles (≤ 45 chars). Does NOT modify source files.
 *
 * Usage: node scripts/patch-edge-locales.mjs [build-dir]
 * Default build-dir: build/chrome-mv3-edge
 */

import fs from "fs"
import path from "path"

/**
 * Per-locale short titles for the Edge Add-ons Store.
 * Keys must match the _locales directory names produced by Plasmo.
 */
const EDGE_NAMES = {
  en: "Ophel Atlas: AI Chat Navigator & Organizer",
  zh_CN: "Ophel Atlas：AI 对话大纲导航与会话整理",
  zh_TW: "Ophel Atlas：AI 對話大綱導航與會話整理",
  de: "Ophel Atlas: KI-Chat-Navigator und Organizer",
  es: "Ophel Atlas: Navegador y Organizador de IA",
  fr: "Ophel Atlas: Navigateur et Organisateur IA",
  it: "Ophel Atlas: Navigatore chat IA",
  ja: "Ophel Atlas: AIチャットナビゲーター＆オーガナイザー",
  ko: "Ophel Atlas: AI 채팅 내비게이터 & 정리 도구",
  pt_BR: "Ophel Atlas: Navegador e Organizador de IA",
  ru: "Ophel Atlas: Навигатор и органайзер ИИ-чата",
}

const buildDir = process.argv[2] ?? "build/chrome-mv3-edge"
const localesDir = path.join(buildDir, "_locales")

if (!fs.existsSync(localesDir)) {
  console.error(`[patch-edge-locales] _locales not found in: ${buildDir}`)
  process.exit(1)
}

const langs = fs.readdirSync(localesDir)
let patched = 0
let skipped = 0

for (const lang of langs) {
  const msgPath = path.join(localesDir, lang, "messages.json")
  if (!fs.existsSync(msgPath)) continue

  const pkg = JSON.parse(fs.readFileSync(msgPath, "utf8"))
  if (!pkg.extensionName) continue

  const edgeName = EDGE_NAMES[lang]
  if (!edgeName) {
    console.warn(`[patch-edge-locales] No Edge name for locale "${lang}", keeping original`)
    skipped++
    continue
  }

  pkg.extensionName.message = edgeName
  fs.writeFileSync(msgPath, JSON.stringify(pkg, null, 2) + "\n")
  patched++
}

console.log(`[patch-edge-locales] Patched ${patched} locale(s), skipped ${skipped} (no mapping).`)
