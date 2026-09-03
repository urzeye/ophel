import { readdirSync, readFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

import { describe, expect, it } from "vitest"

import { resources } from "~locales/resources"

const repoRoot = fileURLToPath(new URL("../..", import.meta.url))

const REQUIRED_APP_LOCALES = [
  "zh-CN",
  "zh-TW",
  "en",
  "ja",
  "ko",
  "it",
  "de",
  "es",
  "fr",
  "pt",
  "ru",
] as const

const REQUIRED_MANIFEST_LOCALES = [
  "zh_CN",
  "zh_TW",
  "en",
  "ja",
  "ko",
  "it",
  "de",
  "es",
  "fr",
  "pt_BR",
  "ru",
] as const

function collectKeys(value: unknown, prefix = ""): string[] {
  if (value === null || value === undefined) {
    return prefix ? [prefix] : []
  }
  if (typeof value !== "object" || Array.isArray(value)) {
    return prefix ? [prefix] : []
  }

  const entries = Object.entries(value as Record<string, unknown>)
  if (entries.length === 0) {
    return prefix ? [prefix] : []
  }

  return entries.flatMap(([key, child]) => {
    const next = prefix ? `${prefix}.${key}` : key
    return collectKeys(child, next)
  })
}

function collectEmptyKeys(value: unknown, prefix = ""): string[] {
  if (value === null || value === undefined) {
    return prefix ? [prefix] : []
  }
  if (typeof value === "string") {
    return value.trim() === "" && prefix ? [prefix] : []
  }
  if (typeof value !== "object" || Array.isArray(value)) {
    return []
  }

  return Object.entries(value as Record<string, unknown>).flatMap(([key, child]) => {
    const next = prefix ? `${prefix}.${key}` : key
    return collectEmptyKeys(child, next)
  })
}

function assertIdenticalKeySets(label: string, keySets: Record<string, Set<string>>): void {
  const locales = Object.keys(keySets)
  const [referenceLocale] = locales
  const referenceKeys = keySets[referenceLocale]

  for (const locale of locales) {
    const keys = keySets[locale]
    const missing = [...referenceKeys].filter((key) => !keys.has(key)).sort()
    const extra = [...keys].filter((key) => !referenceKeys.has(key)).sort()
    expect(missing, `${label}: ${locale} missing keys vs ${referenceLocale}`).toEqual([])
    expect(extra, `${label}: ${locale} extra keys vs ${referenceLocale}`).toEqual([])
  }
}

function loadManifestMessages(locale: string): Record<string, { message?: string }> {
  const filePath = path.join(repoRoot, "locales", locale, "messages.json")
  return JSON.parse(readFileSync(filePath, "utf8")) as Record<string, { message?: string }>
}

describe("i18n completeness", () => {
  it("keeps src/locales key sets identical across all 11 app languages with no empty values", () => {
    expect(Object.keys(resources).sort()).toEqual([...REQUIRED_APP_LOCALES].sort())

    const keySets: Record<string, Set<string>> = {}
    for (const locale of REQUIRED_APP_LOCALES) {
      const catalog = resources[locale]
      expect(catalog, `missing app locale module: ${locale}`).toBeTruthy()
      keySets[locale] = new Set(collectKeys(catalog))
      expect(collectEmptyKeys(catalog), `empty app locale values in ${locale}`).toEqual([])
    }

    assertIdenticalKeySets("src/locales", keySets)
    expect(keySets.en.size).toBeGreaterThan(0)
  })

  it("keeps locales/*/messages.json key sets identical across all 11 manifest languages with no empty messages", () => {
    const localeDirs = readdirSync(path.join(repoRoot, "locales"), { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort()

    expect(localeDirs).toEqual([...REQUIRED_MANIFEST_LOCALES].sort())

    const keySets: Record<string, Set<string>> = {}
    for (const locale of REQUIRED_MANIFEST_LOCALES) {
      const messages = loadManifestMessages(locale)
      keySets[locale] = new Set(Object.keys(messages))
      const emptyMessages = Object.entries(messages)
        .filter(([, value]) => !value?.message?.trim())
        .map(([key]) => key)
        .sort()
      expect(emptyMessages, `empty manifest messages in ${locale}`).toEqual([])
    }

    assertIdenticalKeySets("locales/*/messages.json", keySets)
    expect(keySets.en.size).toBeGreaterThan(0)
  })
})
