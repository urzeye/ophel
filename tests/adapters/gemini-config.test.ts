import { describe, expect, it } from "vitest"

import { GEMINI_CONFIG, GEMINI_CONFIG_VERSION } from "~adapters/gemini-config"

describe("Gemini built-in config and DOM adaptation", () => {
  it("increments GEMINI_CONFIG_VERSION to invalidate obsolete patches", () => {
    expect(GEMINI_CONFIG_VERSION).toBe(4)
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

    // 2. 正文直接子元素解除 @scope 708px 限制规则
    const contentChildSelector = selectors.find(
      (s) =>
        s.selector.includes(".md-content > *") ||
        s.selector.includes("message-content .markdown > *"),
    )
    expect(contentChildSelector).toBeDefined()
    expect(contentChildSelector?.property).toBe("max-width")
    expect(contentChildSelector?.value).toBe("100%")
    expect(contentChildSelector?.noCenter).toBe(true)

    // 3. message-actions 操作栏对齐规则
    const messageActionsSelector = selectors.find((s) => s.selector.includes("message-actions"))
    expect(messageActionsSelector).toBeDefined()
    expect(messageActionsSelector?.property).toBe("max-width")
    expect(messageActionsSelector?.value).toBe("100%")
    expect(messageActionsSelector?.extraCss).toContain("margin-inline-start: 0 !important;")
  })

  it("supports thinking-overlay in outline thoughts and export noise", () => {
    expect(GEMINI_CONFIG.sitePrivateSelectors.outlineThoughts).toContain("thinking-overlay")
    expect(GEMINI_CONFIG.sitePrivateSelectors.assistantExportNoise).toContain("thinking-overlay")
    expect(GEMINI_CONFIG.sitePrivateSelectors.assistantExportNoise).toContain("sources-list")
  })

  it("hides new disclaimers in clean mode", () => {
    const hideList = GEMINI_CONFIG.cleanMode.hide
    expect(hideList).toContain("hallucination-disclaimer")
    expect(hideList).toContain("condensed-tos-disclaimer")
    expect(hideList).toContain("model-response-disclaimers")
  })

  it("includes updated submit button and model switcher selectors", () => {
    expect(
      GEMINI_CONFIG.selectors.submitButton.some(
        (sel) => sel.includes("send-button") || sel.includes("send"),
      ),
    ).toBe(true)
    expect(GEMINI_CONFIG.modelSwitcher.selectorButtonSelectors).toContain(
      '[data-test-id="bard-mode-menu-button"]',
    )
  })

  it("ensures selectors cover new Gemini custom elements and fallback classes", () => {
    // 验证 turnSelector 支持自定义元素与类选择器
    expect(GEMINI_CONFIG.export.turnSelector).toBe(
      ".conversation-container, conversation-container, .conversation-turn",
    )

    // 验证 scrollContainer 包含主滚动区与滚动容器类
    expect(GEMINI_CONFIG.selectors.scrollContainer).toContain(
      "infinite-scroller.chat-history, .chat-history-scroll-container",
    )

    // 验证 userQuery 与 assistantResponse 保持对自定义组件标签的匹配
    expect(GEMINI_CONFIG.selectors.userQuery).toBe("user-query")
    expect(GEMINI_CONFIG.selectors.assistantResponse).toBe("model-response")
  })
})
