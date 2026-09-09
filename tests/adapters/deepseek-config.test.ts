import { afterEach, describe, expect, it, vi } from "vitest"

import { SITE_IDS } from "~constants/defaults"
import { resolveBuiltinConfig } from "~core/builtin-config-registry"

import { DeepSeekAdapter } from "~adapters/deepseek"
import { DEEPSEEK_CONFIG, DEEPSEEK_CONFIG_VERSION } from "~adapters/deepseek-config"

vi.mock("~utils/export-assets", () => ({
  createExportAssetCollector: vi.fn(() => ({ assets: [], usedPaths: new Set() })),
  formatExportFileAttachments: vi.fn(() => ""),
  formatExportImageAttachments: vi.fn(() => ""),
  isDownloadableExportAssetUrl: vi.fn(() => false),
  normalizeExportAssetUrl: vi.fn(() => null),
}))

vi.mock("~utils/exporter", () => ({
  htmlToMarkdown: vi.fn(() => ""),
}))

vi.mock("~utils/dom-toolkit", () => ({
  DOMToolkit: {
    query: vi.fn(),
  },
}))

vi.mock("~utils/i18n", () => ({
  t: (key: string) => key,
}))

const stubDeepSeekWindow = (): void => {
  vi.stubGlobal("window", { location: new URL("https://chat.deepseek.com/") })
}

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe("DeepSeek built-in config and new chat selectors", () => {
  it("increments DEEPSEEK_CONFIG_VERSION to 2 to invalidate obsolete patches", () => {
    expect(DEEPSEEK_CONFIG_VERSION).toBe(2)
    const descriptor = resolveBuiltinConfig(SITE_IDS.DEEPSEEK)
    expect(descriptor).toEqual({
      siteId: SITE_IDS.DEEPSEEK,
      configVersion: 2,
      baseConfig: DEEPSEEK_CONFIG,
    })
  })

  it("exposes newChatButton selectors matching modern DeepSeek button structure", () => {
    stubDeepSeekWindow()
    const adapter = new DeepSeekAdapter()
    const selectors = adapter.getNewChatButtonSelectors()

    expect(selectors).toEqual(DEEPSEEK_CONFIG.selectors.newChatButton)
    expect(selectors.some((s) => s.includes("M8 0.599609"))).toBe(true)
    expect(selectors.some((s) => s.includes(".ds-icon") && s.includes(".ds-focus-ring"))).toBe(true)
    expect(selectors).toContain('a[href="/a/chat"]')
  })

  it("ensures newChatButton array in DEEPSEEK_CONFIG has non-empty valid selector strings", () => {
    expect(DEEPSEEK_CONFIG.selectors.newChatButton.length).toBeGreaterThan(0)
    for (const selector of DEEPSEEK_CONFIG.selectors.newChatButton) {
      expect(typeof selector).toBe("string")
      expect(selector.trim().length).toBeGreaterThan(0)
    }
  })
})
