import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"

import { describe, expect, it } from "vitest"

import { SITE_ICONS } from "~constants/site-icons"
import { getHighlightStyles } from "~utils/markdown"

import { INLINE_HIGHLIGHT_STYLES } from "../../src/styles/markdown-preview-inline"
import { INLINE_USER_QUERY_MARKDOWN_STYLES } from "../../src/styles/user-query-markdown-inline"

const userscriptConfig = readFileSync(
  fileURLToPath(new URL("../../vite.userscript.config.ts", import.meta.url)),
  "utf8",
)

describe("userscript style and icon exports", () => {
  it("reads markdown preview styles from the exported constant instead of regex extraction", () => {
    expect(INLINE_HIGHLIGHT_STYLES).toContain(".hljs")
    expect(getHighlightStyles()).toBe(INLINE_HIGHLIGHT_STYLES)
    expect(userscriptConfig).toContain("INLINE_HIGHLIGHT_STYLES")
    expect(userscriptConfig).not.toMatch(/extractReturnedTemplateLiteral/)
    expect(userscriptConfig).not.toMatch(/runInNewContext/)
  })

  it("reads user-query markdown styles from the exported constant", () => {
    expect(INLINE_USER_QUERY_MARKDOWN_STYLES).toContain(".gh-user-query-markdown")
    expect(userscriptConfig).toContain("INLINE_USER_QUERY_MARKDOWN_STYLES")
  })

  it("serializes SITE_ICONS from the exported map", () => {
    const serialized = JSON.stringify(SITE_ICONS)
    expect(JSON.parse(serialized)).toEqual(SITE_ICONS)
    expect(Object.keys(SITE_ICONS).length).toBeGreaterThan(0)
    expect(userscriptConfig).toContain("JSON.stringify(SITE_ICONS)")
  })
})
