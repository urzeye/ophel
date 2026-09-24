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
  it("increments DEEPSEEK_CONFIG_VERSION to 6 to invalidate obsolete patches", () => {
    expect(DEEPSEEK_CONFIG_VERSION).toBe(6)
    const descriptor = resolveBuiltinConfig(SITE_IDS.DEEPSEEK)
    expect(descriptor).toEqual({
      siteId: SITE_IDS.DEEPSEEK,
      configVersion: 6,
      baseConfig: DEEPSEEK_CONFIG,
    })
  })

  it("insets the shared right preview panel (document preview and canvas) away from the floating panel", () => {
    stubDeepSeekWindow()
    const adapter = new DeepSeekAdapter()
    const { sitePrivateSelectors } = DEEPSEEK_CONFIG

    // 边栏容器靠 aria-hidden 显隐切换 + 标题栏 role="heading" 识别，不依赖哈希类名
    expect(sitePrivateSelectors.panelPreviewScope).toContain('[aria-hidden="false"]')
    expect(sitePrivateSelectors.panelPreviewScope).toContain('[role="heading"]')
    expect(sitePrivateSelectors.panelPreviewContent).toContain(
      sitePrivateSelectors.panelPreviewScope,
    )

    const avoidance = adapter.getPanelAvoidanceConfig()
    const previewInset = avoidance.insetSelectors?.find(
      (inset) => inset.scopeSelector === sitePrivateSelectors.panelPreviewScope,
    )
    // 只内缩边栏内容列右侧；强制 border-box 让 padding 对内联宽度生效
    expect(previewInset).toMatchObject({
      selector: sitePrivateSelectors.panelPreviewContent,
      obstacleSelectors: [],
      applySide: "right",
      insetMode: "edge",
    })
    expect(previewInset?.extraCss).toContain("box-sizing: border-box")
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
