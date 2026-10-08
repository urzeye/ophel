import { afterEach, describe, expect, it, vi } from "vitest"

import type { WidthSelectorConfig } from "~adapters/base"
import { ChatGPTAdapter } from "~adapters/chatgpt"
import {
  CHATGPT_CONFIG_VERSION,
  CHATGPT_HOME_UX_SCOPE,
  CHATGPT_HOME_COMPOSER_SELECTOR,
  CHATGPT_NEW_UX_SCOPE,
  CHATGPT_PAGE_WIDTH_SCOPE,
} from "~adapters/chatgpt-config"
import { LayoutManager } from "~core/layout-manager"

vi.mock("~utils/export-assets", () => ({
  createExportAssetCollector: vi.fn(() => ({ assets: [], usedPaths: new Set() })),
  escapeMarkdownLinkText: vi.fn((value: string) => value),
  formatExportFileAttachments: vi.fn(() => ""),
  formatExportImageMarkdown: vi.fn(() => ""),
  isDownloadableExportAssetUrl: vi.fn(() => false),
  normalizeExportAssetUrl: vi.fn(() => null),
}))

vi.mock("~utils/exporter", () => ({
  htmlToMarkdown: vi.fn(() => ""),
}))

vi.mock("~stores/settings-store", () => ({ useSettingsStore: { getState: vi.fn() } }))
vi.mock("~utils/dom-toolkit", () => ({
  DOMToolkit: { query: vi.fn(() => []), walkShadowRoots: vi.fn() },
}))
vi.mock("~utils/font", () => ({
  INTER_LOCAL_FONT_FACE: "",
  getPlatformFontFamily: () => "sans-serif",
}))
vi.mock("~utils/i18n", () => ({ t: (key: string) => key }))

type LayoutInternals = {
  generatePageWidthCSS(): string
  generateUserQueryWidthCSS(): string
  buildCSSFromSelectors(
    selectors: WidthSelectorConfig[],
    globalWidth: string,
    useGlobalSelector: boolean,
  ): string
  userQueryWidthConfig: { enabled: boolean; value: string; unit: string } | null
}

const createLayoutManager = (): LayoutInternals => {
  vi.stubGlobal("window", { location: { pathname: "/c/example" } })
  return new LayoutManager(new ChatGPTAdapter(), {
    enabled: true,
    value: "82",
    unit: "%",
  }) as unknown as LayoutInternals
}

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe("ChatGPT redesigned page width fallback", () => {
  it("keeps the legacy selectors and scopes full-width normalization to new-UX conversation and home surfaces", () => {
    const adapter = new ChatGPTAdapter()
    const selectors = adapter.getWidthSelectors()
    const css = createLayoutManager().generatePageWidthCSS()
    const scope = CHATGPT_PAGE_WIDTH_SCOPE

    expect(CHATGPT_CONFIG_VERSION).toBe(8)
    expect(selectors).toEqual(
      expect.arrayContaining([
        { selector: '[class*="thread-content-max-width"]', property: "max-width" },
        { selector: '[style*="--thread-content-max-width"]', property: "max-width" },
      ]),
    )
    expect(css).toContain(
      `${scope} [class*="--thread-content-responsive-max-width:"] { max-width: none !important;`,
    )
    expect(css).toContain(
      `${scope} [class*="thread-content-max-width"]:not([class*="--thread-body-max-width:"]) { max-width: 100% !important;`,
    )
    expect(css).toContain(
      `${scope} [class*="--thread-body-max-width:"] { max-width: 82% !important;`,
    )
    expect(css).toContain(
      `${scope} [class*="--thread-body-max-width:"] { max-width: 82% !important; margin-left: auto !important; margin-right: auto !important;`,
    )
    expect(css).toContain(
      "width: 100% !important; min-width: 0 !important; margin-left: 0 !important; margin-right: 0 !important;",
    )
    expect(css).toContain(
      '[class*="thread-content-max-width"]:not([class*="--thread-body-max-width:"])',
    )
    expect(css).toContain("--thread-content-responsive-max-width: 100% !important;")
    expect(css).toContain("--thread-body-max-width: 100% !important;")
  })

  it("recognizes Work homes and message-free transcripts without selecting Images by its composer alone", () => {
    expect(CHATGPT_HOME_COMPOSER_SELECTOR).toContain('[data-thread-find-composer="true"]')
    expect(CHATGPT_HOME_COMPOSER_SELECTOR).toContain("[data-chatgpt-composer]")
    expect(CHATGPT_NEW_UX_SCOPE).toContain("[data-app-action-timeline-scroll]")
    expect(CHATGPT_NEW_UX_SCOPE).toContain('[data-thread-user-message-navigation-content="true"]')
    expect(CHATGPT_NEW_UX_SCOPE).not.toContain("data-composer-placement")
  })

  it("uses the local user bubble width variable while preserving the legacy root rule", () => {
    const adapter = new ChatGPTAdapter()
    const selectors = adapter.getUserQueryWidthSelectors()
    const manager = createLayoutManager()
    manager.userQueryWidthConfig = { enabled: true, value: "68", unit: "%" }
    const css = manager.generateUserQueryWidthCSS()

    expect(selectors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          selector: ":root",
          property: "--user-chat-width",
          noCenter: true,
        }),
        expect.objectContaining({
          selector: expect.stringContaining('[data-user-message-bubble="true"]'),
          property: "--user-chat-width",
          noCenter: true,
        }),
      ]),
    )
    expect(css).toContain(":root { --user-chat-width: 68% !important;")
    expect(css).toContain('[data-user-message-bubble="true"] { --user-chat-width: 68% !important;')
    expect(css).not.toContain("margin-left: auto")
    expect(css).toContain(`${CHATGPT_NEW_UX_SCOPE} [data-user-message-bubble="true"]`)
    expect(css).not.toContain(CHATGPT_HOME_UX_SCOPE)
  })

  it("keeps avoidance normalization aligned and gives only body owners the reserved width", () => {
    const adapter = new ChatGPTAdapter()
    const avoidance = adapter.getPanelAvoidanceConfig()
    const scope = CHATGPT_PAGE_WIDTH_SCOPE
    const css = createLayoutManager().buildCSSFromSelectors(
      avoidance.widthSelectors,
      "516px",
      false,
    )
    const responsiveRule = css.indexOf(`${scope} [class*="--thread-content-responsive-max-width:"]`)
    const bodyOwnerRule = css.indexOf(`${scope} [class*="--thread-body-max-width:"]`)

    expect(css).toContain("max-width: none !important;")
    expect(css).toContain("max-width: 100% !important;")
    expect(css).toContain(
      `${scope} [class*="--thread-body-max-width:"] { max-width: 516px !important;`,
    )
    expect(bodyOwnerRule).toBeGreaterThan(responsiveRule)

    const scrollInset = avoidance.insetSelectors?.find((item) =>
      item.selector.includes(".thread-scroll-container[data-app-action-timeline-scroll]"),
    )
    const footerInset = avoidance.insetSelectors?.find((item) =>
      item.selector.includes('[data-thread-scroll-footer="true"]'),
    )
    expect(scrollInset).toMatchObject({ insetMode: "edge" })
    expect(footerInset).toMatchObject({
      leftProperty: "left",
      rightProperty: "right",
      insetMode: "edge",
    })
    expect(footerInset?.extraCss).toContain("max-width: none !important;")
  })

  it("applies project width after ancestor normalization without changing native padding", () => {
    const adapter = new ChatGPTAdapter()
    const manager = createLayoutManager()
    const project = adapter
      .getWidthSelectors()
      .find((item) => item.selector.includes("data-chatgpt-project-conversation-drop-target"))!
    const pageCss = manager.generatePageWidthCSS()
    const avoidanceCss = manager.buildCSSFromSelectors(
      adapter.getPanelAvoidanceConfig().widthSelectors,
      "516px",
      false,
    )

    expect(CHATGPT_PAGE_WIDTH_SCOPE).toContain(CHATGPT_NEW_UX_SCOPE)
    expect(CHATGPT_PAGE_WIDTH_SCOPE).toContain(CHATGPT_HOME_UX_SCOPE)
    expect(project.selector).toContain(CHATGPT_HOME_UX_SCOPE)
    expect(project.selector).toContain('[class~="max-w-[var(--thread-content-max-width)]"]')
    expect(project.selector).toContain(`:has(${CHATGPT_HOME_COMPOSER_SELECTOR})`)
    expect(project.value).toBeUndefined()
    expect(project.extraCss).toContain("margin-left: auto !important;")
    expect(project.extraCss).not.toContain("padding")
    expect(pageCss).toContain(`${project.selector} { max-width: 82% !important;`)
    expect(avoidanceCss).toContain(`${project.selector} { max-width: 516px !important;`)
    expect(pageCss.indexOf(`${project.selector} {`)).toBeGreaterThan(
      pageCss.indexOf(`${CHATGPT_PAGE_WIDTH_SCOPE} [class*=\"thread-content-max-width\"]`),
    )
    expect(project.selector).not.toMatch(/VyOS|storage|g-p-/)
  })

  it("reserves home edges once without applying conversation footer offsets to home", () => {
    const config = new ChatGPTAdapter().getPanelAvoidanceConfig()
    const homeInsets = config.insetSelectors!.filter((item) =>
      item.selector.startsWith(CHATGPT_HOME_UX_SCOPE),
    )

    expect(homeInsets).toHaveLength(1)
    expect(homeInsets[0]).toMatchObject({
      selector: `${CHATGPT_HOME_UX_SCOPE} [role="main"][class*="[container-name:home-main-content]"]`,
      insetMode: "edge",
    })
    expect(homeInsets[0].extraCss).toContain("box-sizing: border-box !important;")
    expect(
      config.insetSelectors!.find((item) =>
        item.selector.includes('[data-thread-scroll-footer="true"]'),
      )?.selector,
    ).toContain(CHATGPT_NEW_UX_SCOPE)
  })
})
