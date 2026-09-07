import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"

import { describe, expect, it } from "vitest"

import { SITE_IDS, SUPPORTED_AI_PLATFORMS } from "~constants/defaults"
import {
  getBuiltinSiteEntryUrls,
  orderBuiltinSitesByCurrentUrl,
} from "~tabs/options/builtin-sites-list"

const catalogIds = SUPPORTED_AI_PLATFORMS.map((platform) => platform.id)

const pinnedIds = (pageUrl: string): string[] =>
  orderBuiltinSitesByCurrentUrl(SUPPORTED_AI_PLATFORMS, pageUrl).map((platform) => platform.id)

const readSource = (relativePath: string): string =>
  readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), "utf8")

describe("orderBuiltinSitesByCurrentUrl", () => {
  it("moves only the matching builtin to index 0 and keeps catalog order for the rest", () => {
    const claudeIndex = catalogIds.indexOf(SITE_IDS.CLAUDE)
    expect(claudeIndex).toBeGreaterThan(0)

    const ordered = pinnedIds("https://claude.ai/chat/123")
    expect(ordered[0]).toBe(SITE_IDS.CLAUDE)
    expect(ordered.slice(1)).toEqual(catalogIds.filter((id) => id !== SITE_IDS.CLAUDE))
    expect(ordered).toHaveLength(catalogIds.length)
  })

  it("leaves catalog order unchanged when the matching builtin is already first", () => {
    expect(catalogIds[0]).toBe(SITE_IDS.CHATGPT)
    expect(pinnedIds("https://chatgpt.com/c/123")).toEqual(catalogIds)
  })

  it("pins Kimi for both kimi.com and kimi.ai without splitting the row", () => {
    expect(pinnedIds("https://www.kimi.com/chat/abc")[0]).toBe(SITE_IDS.KIMI)
    expect(pinnedIds("https://www.kimi.ai/chat/abc")[0]).toBe(SITE_IDS.KIMI)
    expect(SUPPORTED_AI_PLATFORMS.filter((platform) => platform.id === SITE_IDS.KIMI)).toHaveLength(
      1,
    )
  })

  it("keeps catalog order when the page is not a builtin site", () => {
    expect(pinnedIds("https://example.com/")).toEqual(catalogIds)
    expect(pinnedIds("chrome-extension://ophel/tabs/options.html")).toEqual(catalogIds)
    expect(pinnedIds("")).toEqual(catalogIds)
  })
})

describe("getBuiltinSiteEntryUrls", () => {
  it("exposes every catalog entry URL for Kimi, not only the first host", () => {
    const kimi = SUPPORTED_AI_PLATFORMS.find((platform) => platform.id === SITE_IDS.KIMI)
    expect(kimi).toBeDefined()
    if (!kimi) return

    const urls = getBuiltinSiteEntryUrls(kimi)
    expect(urls).toBe(kimi.entryUrls)
    expect(urls).toContain("https://www.kimi.com")
    expect(urls).toContain("https://www.kimi.ai")
    expect(urls.length).toBeGreaterThan(1)
  })

  it("leaves single-entry builtins as one openable URL", () => {
    const chatgpt = SUPPORTED_AI_PLATFORMS.find((platform) => platform.id === SITE_IDS.CHATGPT)
    expect(chatgpt).toBeDefined()
    if (!chatgpt) return

    expect(getBuiltinSiteEntryUrls(chatgpt)).toEqual(chatgpt.entryUrls)
    expect(chatgpt.entryUrls).toHaveLength(1)
  })
})

describe("Adapter Center built-in list wiring", () => {
  it("renders every entry URL from the helper and does not take only entryUrls[0]", () => {
    const pageSource = readSource("../../../src/tabs/options/pages/SitePacksPage.tsx")

    expect(pageSource).toContain("orderBuiltinSitesByCurrentUrl")
    expect(pageSource).toContain("getBuiltinSiteEntryUrls")
    expect(pageSource).toContain("entryUrls.map(")
    expect(pageSource).not.toMatch(/site\.entryUrls\[0\]/)
    expect(pageSource).toContain("builtinSites.map(renderBuiltinSite)")
  })
})
