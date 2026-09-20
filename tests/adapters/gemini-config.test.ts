import { describe, expect, it, vi } from "vitest"

import { GeminiAdapter } from "~adapters/gemini"
import { GEMINI_CONFIG, GEMINI_CONFIG_VERSION } from "~adapters/gemini-config"

vi.mock("~utils/dom-toolkit", () => ({
  DOMToolkit: {
    query: vi.fn(),
  },
}))

vi.mock("~utils/i18n", () => ({
  t: (key: string) => key,
}))

describe("Gemini built-in config and DOM adaptation", () => {
  it("increments GEMINI_CONFIG_VERSION to invalidate obsolete patches", () => {
    expect(GEMINI_CONFIG_VERSION).toBe(6)
  })

  it("extracts conversation id from anchor href after sidebar jslog became base64-encoded", () => {
    const { idFrom } = GEMINI_CONFIG.conversation
    expect(idFrom.attr).toBe("href")

    // 取自新版侧边栏真实结构：<a href="/app/<id>">
    const href = "/app/f7e219afc0080de3"
    expect(href.match(new RegExp(idFrom.regex))?.[1]).toBe("f7e219afc0080de3")
  })

  it("matches the renamed conversation history loading spinner", () => {
    const selector = GEMINI_CONFIG.sitePrivateSelectors.historyLoadingSpinner
    expect(selector).toContain('[data-test-id="loading-content-spinner"]')
    expect(selector).toContain('[data-test-id="loading-history-spinner"]')
  })

  it("adapts messageWidth and turnSelector to conversation-container web component", () => {
    expect(GEMINI_CONFIG.export.turnSelector).toContain(".conversation-container")
    expect(GEMINI_CONFIG.export.turnSelector).toContain("conversation-container")
    expect(GEMINI_CONFIG.sitePrivateSelectors.exportMessageSource).toContain(
      ".conversation-container",
    )
    expect(GEMINI_CONFIG.sitePrivateSelectors.exportMessageSource).toContain(
      "conversation-container",
    )
  })

  it("includes width selectors that override the 708px max-width rule on AI responses", () => {
    const selectors = GEMINI_CONFIG.widthSelectors

    // 1. 根容器宽度规则
    const containerSelector = selectors.find(
      (s) =>
        s.selector.includes(".conversation-container") &&
        s.selector.includes("conversation-container"),
    )
    expect(containerSelector).toBeDefined()
    expect(containerSelector?.property).toBe("max-width")
    expect(containerSelector?.extraCss).toContain("width: 100% !important;")

    // 2. 正文直接子元素解除 @scope 708px 限制规则（含选举、财经等免责条）
    const contentChildSelector = selectors.find(
      (s) =>
        s.selector.includes(".md-content > *") ||
        s.selector.includes("message-content .markdown > *"),
    )
    expect(contentChildSelector).toBeDefined()
    expect(contentChildSelector?.property).toBe("max-width")
    expect(contentChildSelector?.value).toBe("100%")
    expect(contentChildSelector?.noCenter).toBe(true)
    expect(contentChildSelector?.selector).toContain("election-info-disclaimer")
    expect(contentChildSelector?.selector).toContain("finance-info-disclaimer")

    // 3. message-actions 操作栏对齐规则
    const messageActionsSelector = selectors.find((s) => s.selector.includes("message-actions"))
    expect(messageActionsSelector).toBeDefined()
    expect(messageActionsSelector?.property).toBe("max-width")
    expect(messageActionsSelector?.value).toBe("100%")
    expect(messageActionsSelector?.extraCss).toContain("margin-inline-start: 0 !important;")
  })

  it("configures messageSafeArea directly to infinite-scroller.chat-history", () => {
    const messageSafeArea = GEMINI_CONFIG.sitePrivateSelectors.messageSafeArea
    expect(messageSafeArea).toBe("infinite-scroller.chat-history")
  })

  it("provides full widthSelectors in getPanelAvoidanceConfig to preserve child element width overrides", () => {
    const adapter = new GeminiAdapter()
    const avoidanceConfig = adapter.getPanelAvoidanceConfig()
    expect(avoidanceConfig.widthSelectors).toHaveLength(GEMINI_CONFIG.widthSelectors.length)

    // 验证避让配置中包含解除 708px 限制的规则
    const contentChildSelector = avoidanceConfig.widthSelectors.find((s) =>
      s.selector.includes(".md-content > *"),
    )
    expect(contentChildSelector).toBeDefined()
    expect(contentChildSelector?.value).toBe("100%")
  })

  it("supports thinking-overlay and filters message-actions in outline thoughts and export noise", () => {
    expect(GEMINI_CONFIG.sitePrivateSelectors.outlineThoughts).toContain("thinking-overlay")
    expect(GEMINI_CONFIG.sitePrivateSelectors.assistantExportNoise).toContain("thinking-overlay")
    expect(GEMINI_CONFIG.sitePrivateSelectors.assistantExportNoise).toContain("sources-list")
    expect(GEMINI_CONFIG.sitePrivateSelectors.assistantExportNoise).toContain(
      "deep-research-source-lists",
    )
    expect(GEMINI_CONFIG.sitePrivateSelectors.assistantExportNoise).toContain("message-actions")
  })

  it("hides new disclaimers and banners in clean mode", () => {
    const hideList = GEMINI_CONFIG.cleanMode.hide
    const preserveFlowList = GEMINI_CONFIG.cleanMode.preserveFlow
    expect(preserveFlowList).toContain("hallucination-disclaimer")
    expect(preserveFlowList).toContain("condensed-tos-disclaimer")
    expect(preserveFlowList).toContain("model-response-disclaimers")
    expect(preserveFlowList).toContain("election-info-disclaimer")
    expect(preserveFlowList).toContain("finance-info-disclaimer")
    expect(preserveFlowList).toContain("freemium-rag-disclaimer")
    expect(preserveFlowList).toContain("freemium-file-upload-near-quota-disclaimer")
    expect(preserveFlowList).toContain("freemium-file-upload-quota-exceeded-disclaimer")
    expect(hideList).toContain("sensitive-memories-banner")
    expect(hideList).toContain("bot-banner")
  })

  it("includes updated submit button, stop button and model switcher selectors", () => {
    expect(
      GEMINI_CONFIG.selectors.submitButton.some(
        (sel) => sel.includes("send-button") || sel.includes("send"),
      ),
    ).toBe(true)
    expect(
      GEMINI_CONFIG.selectors.submitButton.some((sel) => sel.includes(".send-button.submit")),
    ).toBe(true)
    expect(
      GEMINI_CONFIG.selectors.stopButton.some((sel) => sel.includes(".send-button.stop")),
    ).toBe(true)
    expect(
      GEMINI_CONFIG.generating.existsSelectors.some((sel) => sel.includes(".send-button.stop")),
    ).toBe(true)
    expect(GEMINI_CONFIG.modelSwitcher.selectorButtonSelectors).toContain(
      '[data-test-id="bard-mode-menu-button"]',
    )
    expect(GEMINI_CONFIG.modelSwitcher.menuItemSelector).toContain(".bard-mode-list-button")
  })

  it("ensures selectors cover new Gemini custom elements and fallback classes", () => {
    // 验证 turnSelector 支持自定义元素与类选择器
    expect(GEMINI_CONFIG.export.turnSelector).toBe(
      ".conversation-container, conversation-container, .conversation-turn",
    )

    // 验证 scrollContainer 包含主滚动区
    expect(GEMINI_CONFIG.selectors.scrollContainer).toContain("infinite-scroller.chat-history")

    // 验证 userQuery 与 assistantResponse 保持对自定义组件标签的匹配
    expect(GEMINI_CONFIG.selectors.userQuery).toBe("user-query")
    expect(GEMINI_CONFIG.selectors.assistantResponse).toBe("model-response")
  })

  it("adapts deep research panel and close button selectors to current Gemini DOM", () => {
    const { deepResearchPanel, deepResearchPanelCloseButton, deepResearchAppDocumentMarkdown } =
      GEMINI_CONFIG.sitePrivateSelectors

    expect(deepResearchPanel).toContain("deep-research-immersive-panel")
    expect(deepResearchPanelCloseButton).toContain("toolbar .close-button button")
    expect(deepResearchPanelCloseButton).toContain('toolbar button:has(mat-icon[fonticon="close"])')
    expect(deepResearchAppDocumentMarkdown).toContain("#extended-response-markdown-content")
  })

  it("adapts deep research card, uploaded file, and drive viewer selectors to current Gemini DOM", () => {
    const {
      canvasCard,
      deepResearchAppTrigger,
      uploadedFile,
      driveViewer,
      driveViewerCloseButton,
    } = GEMINI_CONFIG.sitePrivateSelectors

    expect(canvasCard).toContain("gem-processing-card")
    expect(canvasCard).toContain('[data-test-id="gem-processing-card"]')
    expect(deepResearchAppTrigger).toContain("model-response gem-processing-card")

    expect(uploadedFile).toContain('[data-test-id="uploaded-file"]')
    expect(uploadedFile).toContain("user-query-file-preview")
    expect(uploadedFile).toContain(".new-file-preview-container")

    expect(driveViewer).toContain("drive-viewer")
    expect(driveViewer).toContain('[data-test-id="drive-viewer"]')
    expect(driveViewerCloseButton).toContain("toolbar .close-button button")

    // 验证深度研究报告来源列表已被加入导出噪声列表进行过滤
    const { assistantExportNoise } = GEMINI_CONFIG.sitePrivateSelectors
    expect(assistantExportNoise).toContain("deep-research-source-lists")
    expect(assistantExportNoise).toContain(".end-of-report-marker")
    expect(assistantExportNoise).toContain('[data-test-id="used-sources-button"]')
  })

  it("merges deep research report into the assistant response instead of creating a separate message", async () => {
    const originalDocument = globalThis.document
    const originalWindow = globalThis.window
    const originalHTMLElement = globalThis.HTMLElement
    const originalElement = globalThis.Element
    const originalNode = globalThis.Node

    class MockNode {}
    class MockElement extends MockNode {
      cloneNode() {
        return this
      }
    }
    class MockHTMLElement extends MockElement {}

    globalThis.Node = MockNode as unknown as typeof Node
    globalThis.Element = MockElement as unknown as typeof Element
    globalThis.HTMLElement = MockHTMLElement as unknown as typeof HTMLElement
    globalThis.window = { location: { pathname: "/app/test-id" } } as unknown as Window &
      typeof globalThis

    const mockUserQuery = Object.assign(new MockHTMLElement(), {
      matches: (sel: string) => sel.includes("user-query"),
      closest: () => null,
      querySelector: (sel: string) => (sel === ".query-text" ? { textContent: "开始研究" } : null),
      querySelectorAll: () => [],
      compareDocumentPosition: () => 2,
    }) as unknown as Element

    const mockAssistantResponse = Object.assign(new MockHTMLElement(), {
      matches: (sel: string) => sel.includes("model-response"),
      closest: () => null,
      querySelector: (sel: string) => {
        if (
          sel.includes("shareAssistantMarkdown") ||
          sel.includes("message-content") ||
          sel.includes("model-response-text")
        ) {
          return {
            cloneNode: () => ({
              querySelectorAll: () => [],
              textContent: "我已经完成了研究。你可以提出后续问题或者要求进行改动。",
            }),
            querySelectorAll: () => [],
            textContent: "我已经完成了研究。你可以提出后续问题或者要求进行改动。",
          }
        }
        return null
      },
      querySelectorAll: () => [],
      compareDocumentPosition: () => 4,
    }) as unknown as Element

    const mockTrigger = Object.assign(new MockHTMLElement(), {
      matches: () => true,
      querySelector: (sel: string) => (sel.includes("travel_explore") ? {} : null),
      closest: (sel: string) => (sel.includes("model-response") ? mockAssistantResponse : null),
    })

    const mockReportDoc = Object.assign(new MockHTMLElement(), {
      cloneNode: () => ({
        querySelectorAll: () => [],
        textContent:
          "AI活动平台PRD可行性调研\n\nAI驱动轻量级活动平台MVP技术可行性与商业演进深度调研报告",
      }),
      querySelectorAll: () => [],
      textContent:
        "AI活动平台PRD可行性调研\n\nAI驱动轻量级活动平台MVP技术可行性与商业演进深度调研报告",
    }) as unknown as Element

    globalThis.document = {
      querySelector: (sel: string) => {
        if (sel.includes("extended-response-markdown-content")) return mockReportDoc
        return null
      },
      querySelectorAll: (sel: string) => {
        if (sel.includes("deepResearchAppTrigger") || sel.includes("canvasCard")) {
          return [mockTrigger] as unknown as NodeListOf<Element>
        }
        if (sel.includes("user-query") || sel.includes("model-response")) {
          return [mockUserQuery, mockAssistantResponse] as unknown as NodeListOf<Element>
        }
        return [] as unknown as NodeListOf<Element>
      },
    } as unknown as Document

    try {
      const adapter = new GeminiAdapter()
      const messages = await (
        adapter as unknown as { extractDeepResearchAppMessages(): Promise<unknown[]> }
      ).extractDeepResearchAppMessages()

      expect(messages).toHaveLength(2)
      expect(messages[0]).toEqual({
        role: "user",
        content: "开始研究",
      })
      expect(messages[1].role).toBe("assistant")
      expect(messages[1].content).toContain("我已经完成了研究")
      expect(messages[1].content).toContain("AI活动平台PRD可行性调研")
    } finally {
      globalThis.document = originalDocument
      globalThis.window = originalWindow
      globalThis.HTMLElement = originalHTMLElement
      globalThis.Element = originalElement
      globalThis.Node = originalNode
    }
  })
})
