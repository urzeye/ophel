import { describe, expect, it, vi } from "vitest"

import { GeminiAdapter } from "~adapters/gemini"
import { GEMINI_CONFIG, GEMINI_CONFIG_VERSION } from "~adapters/gemini-config"
import {
  GEMINI_CANVAS_CODE_REQUEST_EVENT,
  GEMINI_CANVAS_CODE_RESPONSE_EVENT,
  installGeminiCanvasCodeBridge,
} from "~core/gemini-canvas-code-bridge"

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

    const mockStructuredContainer = Object.assign(new MockHTMLElement(), {
      matches: (sel: string) => sel.includes("structured-content-container"),
      closest: (sel: string) =>
        sel.includes("structured-content-container") ? mockStructuredContainer : null,
      cloneNode: () => ({
        querySelectorAll: () => [],
        textContent:
          "AI活动平台PRD可行性调研\n\nAI驱动轻量级活动平台MVP技术可行性与商业演进深度调研报告",
      }),
      querySelectorAll: () => [],
      textContent:
        "AI活动平台PRD可行性调研\n\nAI驱动轻量级活动平台MVP技术可行性与商业演进深度调研报告",
    }) as unknown as Element

    const mockSourceLists = Object.assign(new MockHTMLElement(), {
      matches: (sel: string) => sel.includes("deep-research-source-lists"),
      textContent: "报告中使用的来源\nhttps://example.com/source1",
    })

    const mockPanel = Object.assign(new MockHTMLElement(), {
      matches: (sel: string) => sel.includes("deep-research-immersive-panel"),
      querySelector: (sel: string) => {
        if (sel.includes("structured-content-container")) return mockStructuredContainer
        if (sel.includes("deep-research-source-lists")) return mockSourceLists
        return null
      },
      querySelectorAll: (sel: string) => {
        if (sel.includes("structured-content-container")) {
          return [mockStructuredContainer] as unknown as NodeListOf<Element>
        }
        if (sel.includes("deep-research-source-lists")) {
          return [mockSourceLists] as unknown as NodeListOf<Element>
        }
        return [] as unknown as NodeListOf<Element>
      },
      textContent:
        "AI活动平台PRD可行性调研\n\nAI驱动轻量级活动平台MVP技术可行性与商业演进深度调研报告\n\n报告中使用的来源",
    }) as unknown as Element

    globalThis.document = {
      querySelector: (sel: string) => {
        if (sel.includes("structured-content-container")) return mockStructuredContainer
        if (sel.includes("extended-response-markdown-content")) return mockStructuredContainer
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
        adapter as unknown as {
          extractDeepResearchAppMessages(): Promise<Array<{ role: string; content: string }>>
        }
      ).extractDeepResearchAppMessages()

      expect(messages).toHaveLength(2)
      expect(messages[0]).toEqual({
        role: "user",
        content: "开始研究",
      })
      expect(messages[1].role).toBe("assistant")
      expect(messages[1].content).toContain("我已经完成了研究")
      expect(messages[1].content).toContain("AI活动平台PRD可行性调研")
      expect(messages[1].content).not.toContain("报告中使用的来源")

      // 验证面板直接提取时也只保留 structured-content-container
      const panelContent = (
        adapter as unknown as { getDeepResearchPanelMarkdown(panel: Element): string }
      ).getDeepResearchPanelMarkdown(mockPanel)
      expect(panelContent).toContain("AI活动平台PRD可行性调研")
      expect(panelContent).not.toContain("报告中使用的来源")
    } finally {
      globalThis.document = originalDocument
      globalThis.window = originalWindow
      globalThis.HTMLElement = originalHTMLElement
      globalThis.Element = originalElement
      globalThis.Node = originalNode
    }
  })

  it("configures selectors for new Gemini Canvas inline-preview panel, title, close button and code editor", () => {
    const selectors = GEMINI_CONFIG.sitePrivateSelectors

    // 1. 面板容器匹配 inline-preview
    expect(selectors.canvasCodePanel).toContain("inline-preview")
    expect(selectors.canvasCodePanel).toContain(".inline-preview-container")

    // 2. 标题选择器匹配 title-wrapper title
    expect(selectors.canvasPanelTitle).toContain(".title-wrapper .title")
    expect(selectors.canvasTitle).toContain(".title-wrapper .title")
    expect(selectors.canvasNestedTitle).toContain(".title-wrapper .title")

    // 3. 关闭按钮选择器匹配新版结构（无 toolbar 前缀的 gem-icon-button 与 aria-label）
    expect(selectors.canvasPanelCloseButton).toContain('button[aria-label*="关闭"]')
    expect(selectors.canvasPanelCloseButton).toContain(
      'gem-icon-button[fonticonname="close"] button',
    )

    // 4. 代码编辑器选择器支持 monaco 与 code-editor
    expect(selectors.canvasCodeEditor).toContain(".monaco-editor")
    expect(selectors.canvasCodeEditor).toContain("code-editor")
  })

  it("targets card open button, recognizes inline-preview panel, and switches to code tab for extraction", async () => {
    const originalDocument = globalThis.document
    const originalWindow = globalThis.window
    const originalHTMLElement = globalThis.HTMLElement
    const originalElement = globalThis.Element
    const originalNode = globalThis.Node

    class MockNode extends (originalNode || Object) {
      nodeType = 1
    }
    class MockElement extends (originalElement || MockNode) {
      tagName = "DIV"
      nodeName = "DIV"
      style = { top: "0px", height: "100px" }
      cloneNode() {
        return this
      }
      getAttributeNames() {
        return []
      }
      getAttribute(_name: string) {
        return null
      }
      hasAttribute(_name: string) {
        return false
      }
      click?: () => void
      dispatchEvent(event: { type?: string }) {
        if (event?.type === "click" && typeof this.click === "function") {
          this.click()
        }
        return true
      }
    }
    class MockHTMLElement extends (originalHTMLElement || MockElement) {}

    globalThis.Node = MockNode as unknown as typeof Node
    globalThis.Element = MockElement as unknown as typeof Element
    globalThis.HTMLElement = MockHTMLElement as unknown as typeof HTMLElement
    globalThis.window = { location: { pathname: "/app/test-id" } } as unknown as Window &
      typeof globalThis

    let codeTabChecked = false
    let panelOpened = false

    const mockOpenButton = Object.assign(new MockHTMLElement(), {
      tagName: "BUTTON",
      nodeName: "BUTTON",
      matches: (sel: string) => sel.includes("button"),
      getAttribute: (name: string) =>
        name === "aria-label" ? "在 Canvas 中打开《动漫乐园 - 清新版》" : null,
      textContent: "打开",
      click: () => {
        panelOpened = true
      },
    })

    const mockCodeButton = Object.assign(new MockHTMLElement(), {
      tagName: "BUTTON",
      nodeName: "BUTTON",
      matches: (sel: string) => sel.includes("button"),
      getAttribute: (name: string) => (name === "aria-checked" ? String(codeTabChecked) : null),
      textContent: "代码",
      click: () => {
        codeTabChecked = true
      },
    })

    const mockCodeTab = Object.assign(new MockHTMLElement(), {
      matches: (sel: string) => {
        if (sel.includes("mat-button-toggle-checked")) return codeTabChecked
        return sel.includes("mat-button-toggle")
      },
      getAttribute: (name: string) => (name === "value" ? "code" : null),
      querySelector: (sel: string) => (sel.includes("button") ? mockCodeButton : null),
      querySelectorAll: () => [mockCodeButton],
      textContent: "代码",
      isConnected: true,
      click: () => {
        codeTabChecked = true
      },
      dispatchEvent: () => true,
    })

    const mockPreviewTab = Object.assign(new MockHTMLElement(), {
      matches: (sel: string) =>
        sel.includes("mat-button-toggle") &&
        (!codeTabChecked ? sel.includes("mat-button-toggle-checked") : false),
      getAttribute: (name: string) => (name === "value" ? "preview" : null),
      textContent: "预览",
      isConnected: true,
    })

    const mockTabGroup = Object.assign(new MockHTMLElement(), {
      matches: (sel: string) => sel.includes("tab-group"),
      closest: () => null,
      querySelectorAll: () => [mockCodeTab, mockPreviewTab],
    })

    const mockMonacoEditor = Object.assign(new MockHTMLElement(), {
      matches: (sel: string) => sel.includes("monaco-editor"),
      closest: () => null,
      querySelector: (sel: string) => {
        if (sel.includes("textarea") || sel.includes("inputarea")) {
          return { value: "const app = 'AnimeLand';" }
        }
        return null
      },
      querySelectorAll: () => [],
      getAttribute: (name: string) => (name === "data-mode-id" ? "javascript" : null),
      hasAttribute: (name: string) => name === "data-uri" || name === "data-mode-id",
    })

    const mockPanelTitle = Object.assign(new MockHTMLElement(), {
      matches: (sel: string) => sel.includes("title"),
      textContent: "动漫乐园 - 清新版",
    })

    const mockCloseButton = Object.assign(new MockHTMLElement(), {
      matches: (sel: string) => sel.includes("button"),
      getAttribute: (name: string) => (name === "aria-label" ? "关闭" : null),
      click: () => {
        panelOpened = false
      },
    })

    const mockInlinePreview = Object.assign(new MockHTMLElement(), {
      matches: (sel: string) => sel.includes("inline-preview"),
      closest: () => null,
      querySelector: (sel: string) => {
        if (sel.includes("title")) return mockPanelTitle
        if (sel.includes("canvasCodeTab") || sel.includes('value="code"')) return mockCodeTab
        if (sel.includes("canvasCodeEditor") || sel.includes("monaco-editor")) {
          return codeTabChecked ? mockMonacoEditor : null
        }
        if (sel.includes("canvasCodeBlock")) return null
        if (sel.includes("canvasPanelCloseButton") || sel.includes("close")) return mockCloseButton
        return null
      },
      querySelectorAll: (sel: string) => {
        if (sel.includes("canvasTabToggle") || sel.includes("mat-button-toggle")) {
          return [mockCodeTab, mockPreviewTab]
        }
        if (sel.includes("canvasTabGroup")) return [mockTabGroup]
        if (sel.includes("canvasDocumentMarkdown")) return []
        return []
      },
    }) as unknown as HTMLElement

    const mockCardTitle = Object.assign(new MockHTMLElement(), {
      matches: (sel: string) => sel.includes("card-title"),
      textContent: "动漫乐园 - 清新版",
    })

    const mockCard = Object.assign(new MockHTMLElement(), {
      matches: (sel: string) => sel.includes("gem-processing-card"),
      closest: () => null,
      scrollIntoView: () => {},
      querySelector: (sel: string) => {
        if (sel.includes("code_blocks")) return {}
        if (sel.includes("card-title") || sel.includes("title")) return mockCardTitle
        if (sel.includes("open-button") || sel.includes("Canvas") || sel.includes("button")) {
          return mockOpenButton
        }
        return null
      },
      querySelectorAll: (sel: string) => {
        if (sel.includes("open-button") || sel.includes("button")) {
          return [mockOpenButton]
        }
        return []
      },
    }) as unknown as HTMLElement

    globalThis.document = {
      documentElement: new MockElement(),
      querySelector: (sel: string) => {
        if (sel.includes("inline-preview") && panelOpened) return mockInlinePreview
        return null
      },
      querySelectorAll: () => [],
    } as unknown as Document

    try {
      const adapter = new GeminiAdapter()
      const internal = adapter as unknown as {
        getGeminiCanvasCardClickTargets(card: HTMLElement): HTMLElement[]
        openGeminiCanvasCardForExport(card: HTMLElement): Promise<HTMLElement | null>
        extractGeminiCanvasArtifactMarkdown(scope: ParentNode, title: string): Promise<string>
      }

      // 1. 测试点击目标优先包含“打开”按钮
      const targets = internal.getGeminiCanvasCardClickTargets(mockCard)
      expect(targets[0]).toBe(mockOpenButton)

      // 2. 测试主动打开卡片并获取 inline-preview 面板
      const panel = await internal.openGeminiCanvasCardForExport(mockCard)
      expect(panel).not.toBeNull()
      expect(panelOpened).toBe(true)

      // 3. 测试自动切换代码 Tab 并提取代码
      const markdown = await internal.extractGeminiCanvasArtifactMarkdown(
        mockInlinePreview,
        "动漫乐园 - 清新版",
      )
      expect(codeTabChecked).toBe(true)
      expect(markdown).toContain("动漫乐园 - 清新版")
      expect(markdown).toContain("const app = 'AnimeLand';")
    } finally {
      globalThis.document = originalDocument
      globalThis.window = originalWindow
      globalThis.HTMLElement = originalHTMLElement
      globalThis.Element = originalElement
      globalThis.Node = originalNode
    }
  })

  it("correctly identifies targets in multi-turn canvas responses and isolates local scope", async () => {
    const originalDocument = globalThis.document
    const originalWindow = globalThis.window
    const originalHTMLElement = globalThis.HTMLElement
    const originalElement = globalThis.Element
    const originalNode = globalThis.Node

    class MockNode extends (originalNode || Object) {
      nodeType = 1
    }
    class MockElement extends (originalElement || MockNode) {
      tagName = "DIV"
      nodeName = "DIV"
      style = {}
      cloneNode() {
        return this
      }
      getAttributeNames() {
        return []
      }
      getAttribute(_name: string) {
        return null
      }
      hasAttribute(_name: string) {
        return false
      }
      scrollIntoView() {}
      click?: () => void
      dispatchEvent(event: { type?: string }) {
        if (event?.type === "click" && typeof this.click === "function") {
          this.click()
        }
        return true
      }
    }
    class MockHTMLElement extends (originalHTMLElement || MockElement) {}

    globalThis.Node = MockNode as unknown as typeof Node
    globalThis.Element = MockElement as unknown as typeof Element
    globalThis.HTMLElement = MockHTMLElement as unknown as typeof HTMLElement
    globalThis.window = { location: { pathname: "/app/test-id" } } as unknown as Window &
      typeof globalThis

    // 第一轮：折叠的 card
    const mockCard1Title = Object.assign(new MockHTMLElement(), {
      matches: (sel: string) => sel.includes("title"),
      textContent: "多版次主题",
    })
    const mockCard1 = Object.assign(new MockHTMLElement(), {
      matches: (sel: string) => sel.includes("gem-processing-card"),
      closest: (sel: string) => (sel.includes("canvas-entry-chip") ? mockChip1 : null),
      querySelector: (sel: string) => {
        if (sel.includes("code_blocks") || sel.includes("code")) return {}
        if (sel.includes("title")) return mockCard1Title
        return null
      },
      querySelectorAll: () => [],
    })
    const mockChip1 = Object.assign(new MockHTMLElement(), {
      matches: (sel: string) => sel.includes("canvas-entry-chip"),
      querySelector: (sel: string) => {
        if (sel.includes("inline-preview")) return null
        if (sel.includes("gem-processing-card")) return mockCard1
        return null
      },
      querySelectorAll: () => [],
    })
    const mockResponse1 = Object.assign(new MockHTMLElement(), {
      matches: (sel: string) => sel.includes("model-response"),
      querySelector: (sel: string) => {
        if (sel.includes("inline-preview")) return null
        if (sel.includes("gem-processing-card")) return mockCard1
        return null
      },
      querySelectorAll: (sel: string) => {
        if (sel.includes("canvasEntryChip") || sel.includes("canvas-entry-chip")) {
          return [mockChip1]
        }
        if (sel.includes("inline-preview")) return []
        if (sel.includes("canvasCard") || sel.includes("gem-processing-card")) return [mockCard1]
        return []
      },
    })

    // 第二轮：已展开的 inline-preview（无 card）
    const mockPreview2Title = Object.assign(new MockHTMLElement(), {
      matches: (sel: string) => sel.includes("title"),
      textContent: "多版次主题",
    })
    const mockPreview2 = Object.assign(new MockHTMLElement(), {
      matches: (sel: string) => sel.includes("inline-preview"),
      closest: (sel: string) => (sel.includes("canvas-entry-chip") ? mockChip2 : null),
      querySelector: (sel: string) => {
        if (sel.includes("title")) return mockPreview2Title
        return null
      },
      querySelectorAll: () => [],
    })
    const mockChip2 = Object.assign(new MockHTMLElement(), {
      matches: (sel: string) => sel.includes("canvas-entry-chip"),
      querySelector: (sel: string) => {
        if (sel.includes("inline-preview")) return mockPreview2
        return null
      },
      querySelectorAll: () => [],
    })
    const mockResponse2 = Object.assign(new MockHTMLElement(), {
      matches: (sel: string) => sel.includes("model-response"),
      querySelector: (sel: string) => {
        if (sel.includes("inline-preview")) return mockPreview2
        return null
      },
      querySelectorAll: (sel: string) => {
        if (sel.includes("canvasEntryChip") || sel.includes("canvas-entry-chip")) {
          return [mockChip2]
        }
        if (sel.includes("inline-preview")) return [mockPreview2]
        if (sel.includes("canvasCard") || sel.includes("gem-processing-card")) return []
        return []
      },
    })

    globalThis.document = {
      documentElement: new MockElement(),
      querySelector: (sel: string) => {
        if (sel.includes("inline-preview")) return mockPreview2
        return null
      },
      querySelectorAll: () => [],
    } as unknown as Document

    try {
      const adapter = new GeminiAdapter()
      const internal = adapter as unknown as {
        getGeminiCanvasTargetsFromResponse(
          response: Element,
        ): Array<{ type: string; element: HTMLElement }>
        waitForGeminiCanvasPanel(
          expectedTitle?: string,
          timeoutMs?: number,
          localScope?: Element | null,
        ): Promise<HTMLElement | null>
      }

      // 验证第 1 轮识别为 card
      const targets1 = internal.getGeminiCanvasTargetsFromResponse(
        mockResponse1 as unknown as Element,
      )
      expect(targets1).toHaveLength(1)
      expect(targets1[0].type).toBe("card")
      expect(targets1[0].element).toBe(mockCard1)

      // 验证第 2 轮即使已经展开且没有 card，也能正确识别为 preview（避免第二轮导出为空）
      const targets2 = internal.getGeminiCanvasTargetsFromResponse(
        mockResponse2 as unknown as Element,
      )
      expect(targets2).toHaveLength(1)
      expect(targets2[0].type).toBe("preview")
      expect(targets2[0].element).toBe(mockPreview2)

      // 验证第 1 轮在等待面板时，限制在 localScope (mockChip1/mockResponse1)，不会把第 2 轮已有的 preview 误匹配给第 1 轮
      const matchedFor1 = await internal.waitForGeminiCanvasPanel(
        "多版次主题",
        100,
        mockChip1 as unknown as Element,
      )
      expect(matchedFor1).toBeNull()
    } finally {
      globalThis.document = originalDocument
      globalThis.window = originalWindow
      globalThis.HTMLElement = originalHTMLElement
      globalThis.Element = originalElement
      globalThis.Node = originalNode
    }
  })

  it("navigates canvas versions correctly using prev and next buttons", async () => {
    let prevClicked = 0
    let nextClicked = 0
    let prevDisabled = false
    let nextDisabled = false

    const mockPrevBtn = {
      matches: (sel: string) => sel.includes("button"),
      hasAttribute: (name: string) => (name === "disabled" ? prevDisabled : false),
      closest: () => null,
      click: () => {
        prevClicked++
        prevDisabled = true
        nextDisabled = false
      },
      dispatchEvent: () => true,
    }

    const mockNextBtn = {
      matches: (sel: string) => sel.includes("button"),
      hasAttribute: (name: string) => (name === "disabled" ? nextDisabled : false),
      closest: () => null,
      click: () => {
        nextClicked++
        nextDisabled = true
        prevDisabled = false
      },
      dispatchEvent: () => true,
    }

    const mockPanel = {
      querySelector: (sel: string) => {
        if (sel.includes("canvasPrevVersionButton") || sel.includes("上一版本")) {
          return mockPrevBtn
        }
        if (sel.includes("canvasNextVersionButton") || sel.includes("下一版本")) {
          return mockNextBtn
        }
        return null
      },
    } as unknown as HTMLElement

    const adapter = new GeminiAdapter()
    const internal = adapter as unknown as {
      navigateGeminiCanvasVersion(
        panel: HTMLElement,
        occurrenceIndex: number,
        totalOccurrences: number,
      ): Promise<void>
    }

    // 1. 首个版次：应该调用 prev 按钮回退到最早版本
    await internal.navigateGeminiCanvasVersion(mockPanel, 0, 2)
    expect(prevClicked).toBeGreaterThan(0)

    // 2. 最后一个版次：应该调用 next 按钮前进到最新版本
    await internal.navigateGeminiCanvasVersion(mockPanel, 1, 2)
    expect(nextClicked).toBeGreaterThan(0)
  })

  it("excludes .lines-content from canvasMonacoContentHeight and supports .code-content class", () => {
    const { canvasMonacoContentHeight, canvasCodeContent } = GEMINI_CONFIG.sitePrivateSelectors
    expect(canvasMonacoContentHeight).not.toContain(".lines-content")
    expect(canvasMonacoContentHeight).toContain(".view-lines")
    expect(canvasCodeContent).toContain(".code-content:not(web-preview):not(.hidden)")
  })

  it("ensures hasGeminiCanvasCodeSurface requires actual lines or data-uri, preventing premature empty extraction", () => {
    const adapter = new GeminiAdapter()
    const internal = adapter as unknown as {
      hasGeminiCanvasCodeSurface(scope: ParentNode): boolean
    }

    // 刚渲染但内部没有任何 lines 或 data-uri 的空编辑器
    const emptyEditor = {
      matches: (sel: string) => sel.includes("xap-code-editor"),
      closest: () => null,
      querySelector: () => null,
      querySelectorAll: () => [],
    }
    const emptyScope = {
      querySelector: (sel: string) => {
        if (sel.includes("xap-code-editor") || sel.includes("code-editor")) {
          return emptyEditor as unknown as Element
        }
        return null
      },
    } as unknown as ParentNode

    expect(internal.hasGeminiCanvasCodeSurface(emptyScope)).toBe(false)

    // 一旦渲染出 view-line，立即判定为就绪
    const readyEditor = {
      matches: (sel: string) => sel.includes("xap-code-editor"),
      closest: () => null,
      querySelector: () => null,
      querySelectorAll: (sel: string) => {
        if (sel.includes("view-line")) return [{} as Element]
        return []
      },
    }
    const readyScope = {
      querySelector: (sel: string) => {
        if (sel.includes("xap-code-editor") || sel.includes("code-editor")) {
          return readyEditor as unknown as Element
        }
        return null
      },
    } as unknown as ParentNode

    expect(internal.hasGeminiCanvasCodeSurface(readyScope)).toBe(true)
  })

  it("extracts code from Angular component or DOM attached model in main world bridge", () => {
    let capturedResponse: { code: string; language: string } | null = null

    const mockDoc = {
      documentElement: {
        setAttribute: vi.fn(),
      },
      querySelectorAll: (sel: string) => {
        if (sel.includes("xap-code-editor")) {
          return [
            {
              getAttribute: (name: string) => (name === "data-mode-id" ? "html" : null),
            },
          ]
        }
        return []
      },
    }

    const listeners: Array<(e: MessageEvent) => void> = []
    const mockWindow = {
      location: { origin: "https://gemini.google.com" },
      document: mockDoc,
      addEventListener: (_type: string, fn: (e: MessageEvent) => void) => {
        listeners.push(fn)
      },
      postMessage: (msg: unknown) => {
        const data = msg as { type: string; code: string; language: string }
        if (data?.type === GEMINI_CANVAS_CODE_RESPONSE_EVENT) {
          capturedResponse = { code: data.code, language: data.language }
        }
      },
      ng: {
        getComponent: () => ({
          code: "<!DOCTYPE html><html><body><h1>AnimeLand</h1></body></html>",
          language: "html",
        }),
      },
    } as unknown as Window

    installGeminiCanvasCodeBridge(mockWindow)

    // 发送请求事件
    const reqEvent = {
      origin: "https://gemini.google.com",
      data: {
        type: GEMINI_CANVAS_CODE_REQUEST_EVENT,
        requestId: "req-1",
        editorUri: "",
      },
    } as MessageEvent

    for (const l of listeners) {
      l(reqEvent)
    }

    expect(capturedResponse).not.toBeNull()
    expect(capturedResponse?.code).toContain("AnimeLand")
    expect(capturedResponse?.language).toBe("html")
  })

  it("strictly respects editorUri in bridge without leaking unrelated editor models", () => {
    let capturedResponse: { code: string; language: string } | null = null

    const mockDoc = {
      documentElement: {
        setAttribute: vi.fn(),
      },
      querySelectorAll: () => [],
    }

    const listeners: Array<(e: MessageEvent) => void> = []
    const mockWindow = {
      location: { origin: "https://gemini.google.com" },
      document: mockDoc,
      addEventListener: (_type: string, fn: (e: MessageEvent) => void) => {
        listeners.push(fn)
      },
      postMessage: (msg: unknown) => {
        const data = msg as { type: string; code: string; language: string }
        if (data?.type === GEMINI_CANVAS_CODE_RESPONSE_EVENT) {
          capturedResponse = { code: data.code, language: data.language }
        }
      },
      monaco: {
        editor: {
          // 当前活动的 editor 绑定的是 other-model
          getEditors: () => [
            {
              getModel: () => ({
                uri: { toString: () => "inmemory://model/other" },
                getValue: () => "const wrongCode = 'other';",
                getLanguageId: () => "javascript",
              }),
            },
          ],
          // models 列表里包含目标 target-model
          getModels: () => [
            {
              uri: { toString: () => "inmemory://model/other" },
              getValue: () => "const wrongCode = 'other';",
              getLanguageId: () => "javascript",
            },
            {
              uri: { toString: () => "inmemory://model/target" },
              getValue: () => "const correctCode = 'target';",
              getLanguageId: () => "typescript",
            },
          ],
        },
      },
    } as unknown as Window

    installGeminiCanvasCodeBridge(mockWindow)

    // 请求特定 editorUri "inmemory://model/target"
    const reqEvent = {
      origin: "https://gemini.google.com",
      data: {
        type: GEMINI_CANVAS_CODE_REQUEST_EVENT,
        requestId: "req-target",
        editorUri: "inmemory://model/target",
      },
    } as MessageEvent

    for (const l of listeners) {
      l(reqEvent)
    }

    expect(capturedResponse).not.toBeNull()
    // 必须精确匹配到 target model 的代码，绝不能被 getEditors() 里的 other model 截胡
    expect(capturedResponse?.code).toBe("const correctCode = 'target';")
    expect(capturedResponse?.language).toBe("typescript")
  })

  it("detects button disabled status on host gem-icon-button element", async () => {
    let prevClicked = 0
    let hostDisabled = false

    const mockHost = {
      matches: (sel: string) => sel.includes("gem-icon-button"),
      hasAttribute: (name: string) => (name === "disabled" ? hostDisabled : false),
      getAttribute: (name: string) => (name === "aria-disabled" && hostDisabled ? "true" : null),
      classList: {
        contains: (cls: string) => cls === "disabled" && hostDisabled,
      },
      closest: () => null,
    }

    const mockBtn = {
      matches: (sel: string) => sel.includes("button"),
      hasAttribute: () => false,
      getAttribute: () => null,
      classList: { contains: () => false },
      closest: (sel: string) => {
        if (sel.includes("disabled")) {
          return hostDisabled ? mockHost : null
        }
        if (sel.includes("gem-icon-button")) return mockHost
        return null
      },
      click: () => {
        prevClicked++
        hostDisabled = true
      },
      dispatchEvent: () => true,
    }

    const mockPanel = {
      querySelector: (sel: string) => {
        if (sel.includes("canvasPrevVersionButton") || sel.includes("上一版本")) {
          return mockBtn
        }
        return null
      },
    } as unknown as HTMLElement

    const adapter = new GeminiAdapter()
    const internal = adapter as unknown as {
      navigateGeminiCanvasVersion(
        panel: HTMLElement,
        occurrenceIndex: number,
        totalOccurrences: number,
      ): Promise<void>
    }

    // 执行回退，宿主变为 disabled 后应该立刻停止循环
    await internal.navigateGeminiCanvasVersion(mockPanel, 0, 2)
    expect(prevClicked).toBeGreaterThan(0)
    expect(hostDisabled).toBe(true)
  })

  it("does not map fallback 'Gemini Canvas' titles to multi-version context", () => {
    const adapter = new GeminiAdapter()
    const internal = adapter as unknown as {
      extractGeminiCanvasTitle(element: Element): string
    }

    const mockCardWithoutTitle = {
      querySelector: () => null,
      closest: () => null,
    } as unknown as Element

    const title = internal.extractGeminiCanvasTitle(mockCardWithoutTitle)
    expect(title).toBe("Gemini Canvas")
  })
})
