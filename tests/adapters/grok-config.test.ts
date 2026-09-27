import { afterEach, describe, expect, it, vi } from "vitest"

// DOMToolkit 在模块加载时读取全局 document；node 环境提供最小 stub
vi.hoisted(() => {
  const globalRef = globalThis as Record<string, unknown>
  globalRef.document ??= { documentElement: {}, body: {} }
})

import { SITE_IDS } from "~constants/defaults"
import { resolveBuiltinConfig } from "~core/builtin-config-registry"

import { GrokAdapter } from "~adapters/grok"
import { GROK_CONFIG, GROK_CONFIG_VERSION } from "~adapters/grok-config"

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

vi.mock("~utils/i18n", () => ({
  t: (key: string) => key,
}))

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe("Grok built-in config", () => {
  it("uses the shared descriptor and maps the default config to public behavior", () => {
    const adapter = new GrokAdapter()
    const descriptor = resolveBuiltinConfig(SITE_IDS.GROK)

    expect(descriptor).toEqual({
      siteId: SITE_IDS.GROK,
      configVersion: GROK_CONFIG_VERSION,
      baseConfig: GROK_CONFIG,
    })
    expect(adapter.getBuiltinConfig()).toBe(GROK_CONFIG)
    expect(adapter.getBuiltinConfigVersion()).toBe(GROK_CONFIG_VERSION)
    expect(adapter.getUserQuerySelector()).toBe(GROK_CONFIG.selectors.userQuery)
    expect(adapter.getExportConfig()).toEqual(GROK_CONFIG.export)
  })

  // 新版页面（见 grok.com 改版）用 data-testid 区分用户/AI 消息，
  // 不再依赖 rounded-br-lg 圆角类
  it("targets user queries by data-testid on the redesigned page", () => {
    const { userQuery } = GROK_CONFIG.selectors

    expect(userQuery).toContain('[data-testid="user-message"]')
    // 保留旧圆角类作为未改版页面的回退
    expect(userQuery).toContain(".message-bubble.rounded-br-lg")
  })

  it("targets assistant replies by data-testid without matching user bubbles", () => {
    const { assistantResponse } = GROK_CONFIG.selectors

    expect(assistantResponse).toContain('[data-testid="assistant-message"]')
    // 旧反选回退必须排除新版用户气泡，否则会把用户消息误判为 AI 回复
    expect(assistantResponse).toContain(":not(.rounded-br-lg)")
    expect(assistantResponse).toContain(':not([data-testid="user-message"])')
  })

  it("derives export selectors from the same message selectors", () => {
    const { export: exportConfig, selectors } = GROK_CONFIG

    expect(exportConfig.userQuerySelector).toBe(selectors.userQuery)
    expect(exportConfig.assistantResponseSelector).toContain(selectors.assistantResponse)
  })

  it("locates the redesigned chat transcript scroller", () => {
    const { mainScrollContainer, chatSafeArea } = GROK_CONFIG.sitePrivateSelectors

    expect(mainScrollContainer).toContain('[data-testid="chat-transcript-scroller"]')
    expect(chatSafeArea).toContain('[data-testid="chat-transcript-scroller"]')
  })
})
