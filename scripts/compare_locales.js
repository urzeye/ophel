/* eslint-disable no-console */
const fs = require("fs")
const path = require("path")

function extractKeys(filePath) {
  try {
    const content = fs.readFileSync(filePath, "utf8")
    const keys = new Set()
    const lines = content.split("\n")
    const regex = /^\s*([a-zA-Z0-9_]+):/

    lines.forEach((line) => {
      const match = line.match(regex)
      if (match) {
        keys.add(match[1])
      }
    })
    return keys
  } catch (e) {
    console.error(`Error reading ${filePath}:`, e.message)
    return new Set()
  }
}

const localesDir = path.join("src", "locales")
const zhPath = path.join(localesDir, "zh-CN", "index.ts")
const zhKeys = extractKeys(zhPath)

const targetLocales = ["en", "de", "es", "fr", "ja", "ko", "pt", "ru", "zh-TW"]
let output = ""

targetLocales.forEach((lang) => {
  const langPath = path.join(localesDir, lang, "index.ts")
  const langKeys = extractKeys(langPath)
  const missingInLang = [...zhKeys].filter((k) => !langKeys.has(k))

  output += `\n=== Missing keys in ${lang} ===\n`
  output += JSON.stringify(missingInLang, null, 2) + "\n"
})

fs.writeFileSync("comparison_result.txt", output)
console.log("Comparison complete. Check comparison_result.txt")
