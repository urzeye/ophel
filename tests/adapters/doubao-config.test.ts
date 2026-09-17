import { afterEach, describe, expect, it, vi } from "vitest"

import { SITE_IDS } from "~constants/defaults"
import { resolveBuiltinConfig } from "~core/builtin-config-registry"

import { DoubaoAdapter } from "~adapters/doubao"
import { DOUBAO_CONFIG, DOUBAO_CONFIG_VERSION } from "~adapters/doubao-config"

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

const stubDoubaoWindow = (): void => {
  vi.stubGlobal("window", { location: new URL("https://www.doubao.com/chat/") })
}

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe("Doubao built-in config and new chat selectors", () => {
  it("increments DOUBAO_CONFIG_VERSION to 7 to invalidate obsolete patches", () => {
    expect(DOUBAO_CONFIG_VERSION).toBe(7)
    const descriptor = resolveBuiltinConfig(SITE_IDS.DOUBAO)
    expect(descriptor).toEqual({
      siteId: SITE_IDS.DOUBAO,
      configVersion: 7,
      baseConfig: DOUBAO_CONFIG,
    })
    expect(DOUBAO_CONFIG.supportsHostThemeSync).toBe(true)
  })

  it("exposes cleanMode selectors to hide activity entry and header disclaimer", () => {
    expect(DOUBAO_CONFIG.cleanMode.hide).toEqual([
      '[aria-label="活动入口"]',
      `${DOUBAO_CONFIG.sitePrivateSelectors.mainLayoutScope} .h-header-height .s-font-small-strong + div`,
    ])
  })

  it("exposes newChatButton selectors matching modern Doubao button structure", () => {
    stubDoubaoWindow()
    const adapter = new DoubaoAdapter()
    const selectors = adapter.getNewChatButtonSelectors()

    expect(selectors).toEqual(DOUBAO_CONFIG.selectors.newChatButton)
    expect(selectors.some((s) => s.includes("M12.6221 1.01074"))).toBe(true)
    expect(selectors.some((s) => s.includes("sidebar_nav_item"))).toBe(true)
    expect(selectors.some((s) => s.includes("cursor-pointer"))).toBe(true)
  })

  it("ensures newChatButton array in DOUBAO_CONFIG has non-empty valid selector strings", () => {
    expect(DOUBAO_CONFIG.selectors.newChatButton.length).toBeGreaterThan(0)
    for (const selector of DOUBAO_CONFIG.selectors.newChatButton) {
      expect(typeof selector).toBe("string")
      expect(selector.trim().length).toBeGreaterThan(0)
    }
  })
})
