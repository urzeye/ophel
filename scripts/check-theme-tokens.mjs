import fs from "node:fs"
import path from "node:path"
import process from "node:process"

const rootDir = process.cwd()
const srcDir = path.join(rootDir, "src")
const themeTypesFile = path.join(srcDir, "utils/themes/types.ts")
const themeVariablesFile = path.join(srcDir, "styles/theme-variables.css")
const supportedExtensions = new Set([".ts", ".tsx", ".css"])

function walkFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolutePath = path.join(directory, entry.name)
    if (entry.isDirectory()) return walkFiles(absolutePath)
    if (!supportedExtensions.has(path.extname(entry.name))) return []
    if (entry.name.endsWith(".test.ts") || entry.name.endsWith(".test.tsx")) return []
    return [absolutePath]
  })
}

function collectMatches(text, pattern) {
  return new Set(Array.from(text.matchAll(pattern), (match) => match[1]))
}

const sourceFiles = walkFiles(srcDir)
const sourceText = sourceFiles.map((file) => fs.readFileSync(file, "utf8")).join("\n")
const referencedTokens = collectMatches(sourceText, /var\(\s*(--gh-[a-z0-9-]+)/gi)
const declaredTokens = new Set([
  ...collectMatches(sourceText, /(?:^|[\s;{,(])["']?(--gh-[a-z0-9-]+)["']?\s*:/gim),
  ...collectMatches(sourceText, /setProperty\(\s*["'](--gh-[a-z0-9-]+)["']/gi),
])

const typeText = fs.readFileSync(themeTypesFile, "utf8")
const globalThemeTokens = collectMatches(typeText, /["'](--gh-[a-z0-9-]+)["']\??\s*:/gi)
const defaultThemeText = fs.readFileSync(themeVariablesFile, "utf8")
const defaultThemeTokens = collectMatches(defaultThemeText, /(?:^|[\s;{])(--gh-[a-z0-9-]+)\s*:/gim)

const undefinedReferences = [...referencedTokens]
  .filter((token) => !token.endsWith("-"))
  .filter((token) => !declaredTokens.has(token))
  .sort()
const missingDefaults = [...globalThemeTokens]
  .filter((token) => !defaultThemeTokens.has(token))
  .sort()

if (undefinedReferences.length || missingDefaults.length) {
  if (undefinedReferences.length) {
    console.error("Undefined --gh-* references:")
    undefinedReferences.forEach((token) => console.error(`  ${token}`))
  }
  if (missingDefaults.length) {
    console.error("ThemeVariables tokens missing from theme-variables.css:")
    missingDefaults.forEach((token) => console.error(`  ${token}`))
  }
  process.exit(1)
}

console.log(
  `[theme-tokens] ${referencedTokens.size} references validated; ${globalThemeTokens.size} global tokens have defaults`,
)
