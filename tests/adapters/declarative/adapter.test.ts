import { afterEach, describe, expect, it, vi } from "vitest"

import exampleManifest from "../../../registry/examples/site-pack.example.json"
import { setLanguage } from "~utils/i18n"

import { DeclarativeAdapter } from "~adapters/declarative/adapter"
import type { SitePackManifest } from "~adapters/declarative/types"

vi.mock("~utils/dom-toolkit", () => ({
  DOMToolkit: {
    query: vi.fn(),
  },
}))

const createFullManifest = (): SitePackManifest =>
  structuredClone(exampleManifest) as unknown as SitePackManifest

const createMinimalManifest = (): SitePackManifest => ({
  schemaVersion: 1,
  id: "minimal-pack",
  version: 1,
  minAppVersion: "1.1.8",
  name: "Minimal Pack",
  matches: ["https://minimal.example.com/*"],
  capabilities: ["outline"],
  selectors: {
    responseContainer: "main",
  },
})

interface DeclarativeAdapterInputInternals {
  getConfiguredEditor(): { mode: "textarea" | "contenteditable"; editor: HTMLElement } | null
  setTextControlValue(editor: HTMLTextAreaElement, content: string): boolean
  isEditorUpdateValid(editor: HTMLElement, content: string, requireSubmitButton: boolean): boolean
  replaceContentEditableContent(
    editor: HTMLElement,
    content: string,
    requireSubmitButton: boolean,
  ): boolean
}

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  setLanguage("en")
})

describe("DeclarativeAdapter direct mappings", () => {
  it("partitions SitePack data by runtime origin and claims only one exact static origin", () => {
    const manifest = createMinimalManifest()
    manifest.matches = ["https://minimal.example.com/chat/*", "https://minimal.example.com/share/*"]
    vi.stubGlobal("window", {
      location: new URL("https://minimal.example.com/chat/thread-1"),
    })
    const adapter = new DeclarativeAdapter(manifest)

    expect(adapter.getSiteInstanceKey()).toBe("pack:minimal-pack@https://minimal.example.com")
    expect(adapter.canClaimLegacySiteData()).toBe(true)
  })

  it("does not let ambiguous or bound SitePack instances claim shared legacy data", () => {
    vi.stubGlobal("window", { location: new URL("https://chat.example.com/thread-1") })

    const wildcardManifest = createMinimalManifest()
    wildcardManifest.matches = ["https://*.example.com/*"]
    expect(new DeclarativeAdapter(wildcardManifest).canClaimLegacySiteData()).toBe(false)

    const multiOriginManifest = createMinimalManifest()
    multiOriginManifest.matches = ["https://chat.example.com/*", "https://other.example.com/*"]
    expect(new DeclarativeAdapter(multiOriginManifest).canClaimLegacySiteData()).toBe(false)

    const exactManifest = createMinimalManifest()
    exactManifest.matches = ["https://chat.example.com/*"]
    expect(
      new DeclarativeAdapter(exactManifest, {
        explicitOrigin: "https://chat.example.com",
      }).canClaimLegacySiteData(),
    ).toBe(false)
  })

  it("maps identity, localization, theme, and capabilities defensively", () => {
    const manifest = createFullManifest()
    const adapter = new DeclarativeAdapter(manifest)

    setLanguage("zh-CN")
    expect(adapter.getSiteId()).toBe("pack:example-chat")
    expect(adapter.getName()).toBe("示例对话站点")

    const theme = adapter.getThemeColors()
    const capabilities = adapter.getFeatureCapabilities()
    expect(theme).toEqual(manifest.theme)
    expect(capabilities).toEqual(new Set(manifest.capabilities))

    theme.primary = "#000000"
    capabilities.clear()
    manifest.nameI18n!["zh-CN"] = "已修改"
    manifest.theme!.secondary = "#000000"
    manifest.capabilities.length = 0

    expect(adapter.getName()).toBe("示例对话站点")
    expect(adapter.getThemeColors()).toEqual({
      primary: "#1d4ed8",
      secondary: "#f8fafc",
    })
    expect(adapter.getFeatureCapabilities()).toEqual(new Set(exampleManifest.capabilities))
  })

  it("maps selector getters and isolates returned arrays", () => {
    const manifest = createFullManifest()
    const adapter = new DeclarativeAdapter(manifest)
    const scrollElement = {} as HTMLElement
    const sidebarElement = {} as HTMLElement
    const findElement = vi
      .spyOn(adapter, "findElementBySelectors")
      .mockImplementation((selectors) => {
        if (selectors[0] === "main[data-example-chat]") return scrollElement
        if (selectors[0] === "nav[data-conversations]") return sidebarElement
        return null
      })

    expect(adapter.getTextareaSelectors()).toEqual(["textarea[data-prompt]"])
    expect(adapter.getSubmitButtonSelectors()).toEqual(["button[data-action='send']"])
    expect(adapter.getNewChatButtonSelectors()).toEqual(["button[data-action='new-chat']"])
    expect(adapter.getStopButtonSelectors()).toEqual(["button[data-action='stop']"])
    expect(adapter.getResponseContainerSelector()).toBe("main[data-example-chat]")
    expect(adapter.getChatContentSelectors()).toEqual(["article[data-message]"])
    expect(adapter.getUserQuerySelector()).toBe("article[data-message='user']")
    expect(adapter.getScrollContainer()).toBe(scrollElement)
    expect(adapter.getSidebarScrollContainer()).toBe(sidebarElement)
    expect(findElement.mock.calls).toEqual([
      [["main[data-example-chat]"]],
      [["nav[data-conversations]"]],
    ])

    const textareaSelectors = adapter.getTextareaSelectors()
    const submitSelectors = adapter.getSubmitButtonSelectors()
    const newChatSelectors = adapter.getNewChatButtonSelectors()
    const stopSelectors = adapter.getStopButtonSelectors()
    const chatContentSelectors = adapter.getChatContentSelectors()
    textareaSelectors.push("textarea[data-mutated]")
    submitSelectors.push("button[data-mutated]")
    newChatSelectors.push("button[data-mutated]")
    stopSelectors.push("button[data-mutated]")
    chatContentSelectors.push("article[data-mutated]")
    manifest.selectors.textarea!.push("textarea[data-source-mutated]")

    expect(adapter.getTextareaSelectors()).toEqual(["textarea[data-prompt]"])
    expect(adapter.getSubmitButtonSelectors()).toEqual(["button[data-action='send']"])
    expect(adapter.getNewChatButtonSelectors()).toEqual(["button[data-action='new-chat']"])
    expect(adapter.getStopButtonSelectors()).toEqual(["button[data-action='stop']"])
    expect(adapter.getChatContentSelectors()).toEqual(["article[data-message]"])
  })

  it("maps nested configs and returns isolated copies", () => {
    const manifest = createFullManifest()
    const adapter = new DeclarativeAdapter(manifest)

    expect(adapter.getExportConfig()).toEqual(manifest.export)
    expect(adapter.getNetworkMonitorConfig()).toEqual(manifest.networkMonitor)
    expect(adapter.getModelSwitcherConfig("target-model")).toEqual({
      ...manifest.modelSwitcher,
      targetModelKeyword: "target-model",
    })
    expect(adapter.getWidthSelectors()).toEqual(manifest.widthSelectors)
    expect(adapter.getZenModeConfig()).toEqual(manifest.zenMode)
    expect(adapter.getCleanModeConfig()).toEqual(manifest.cleanMode)
    expect(adapter.getSubmitKeyConfig()).toEqual({ key: "Enter" })
    expect(adapter.getQuickQuoteSupportMode()).toBe("enabled")
    expect(adapter.getAssistantMermaidSupportMode()).toBe("fallback")
    expect(adapter.supportsHostThemeSync()).toBe(false)

    const exportConfig = adapter.getExportConfig()!
    const networkConfig = adapter.getNetworkMonitorConfig()!
    const modelConfig = adapter.getModelSwitcherConfig("target-model")!
    const widthSelectors = adapter.getWidthSelectors()
    const zenMode = adapter.getZenModeConfig()!
    const cleanMode = adapter.getCleanModeConfig()!

    exportConfig.userQuerySelector = "article[data-mutated]"
    networkConfig.urlPatterns.push("/api/mutated")
    networkConfig.urlPathEndsWith!.push("/mutated")
    networkConfig.requestBodyRules![0].metadata.source = "mutated"
    modelConfig.selectorButtonSelectors.push("button[data-mutated]")
    modelConfig.subMenuTriggers!.push("Mutated")
    widthSelectors[0].selector = "main[data-mutated]"
    zenMode.hide!.push("aside[data-mutated]")
    zenMode.rootClass!.className = "mutated"
    zenMode.styles![0].value = "1rem"
    cleanMode.hide!.push("aside[data-mutated]")
    cleanMode.styles![0].property = "visibility"

    expect(adapter.getExportConfig()).toEqual(manifest.export)
    expect(adapter.getNetworkMonitorConfig()).toEqual(manifest.networkMonitor)
    expect(adapter.getModelSwitcherConfig("target-model")).toEqual({
      ...manifest.modelSwitcher,
      targetModelKeyword: "target-model",
    })
    expect(adapter.getWidthSelectors()).toEqual(manifest.widthSelectors)
    expect(adapter.getZenModeConfig()).toEqual(manifest.zenMode)
    expect(adapter.getCleanModeConfig()).toEqual(manifest.cleanMode)
  })

  it("uses documented defaults when optional manifest fields are absent", () => {
    const adapter = new DeclarativeAdapter(createMinimalManifest())

    expect(adapter.getThemeColors()).toEqual({
      primary: "#2563eb",
      secondary: "#1d4ed8",
    })
    expect(adapter.getTextareaSelectors()).toEqual([])
    expect(adapter.getSubmitButtonSelectors()).toEqual([])
    expect(adapter.getNewChatButtonSelectors()).toEqual([])
    expect(adapter.getStopButtonSelectors()).toEqual([])
    expect(adapter.getResponseContainerSelector()).toBe("main")
    expect(adapter.getChatContentSelectors()).toEqual([])
    expect(adapter.getUserQuerySelector()).toBeNull()
    expect(adapter.getExportConfig()).toBeNull()
    expect(adapter.getNetworkMonitorConfig()).toBeNull()
    expect(adapter.getModelSwitcherConfig("unused")).toBeNull()
    expect(adapter.getWidthSelectors()).toEqual([])
    expect(adapter.getZenModeConfig()).toBeNull()
    expect(adapter.getCleanModeConfig()).toBeNull()
    expect(adapter.getSubmitKeyConfig()).toEqual({ key: "Enter" })
    expect(adapter.getQuickQuoteSupportMode()).toBe("disabled")
    expect(adapter.getAssistantMermaidSupportMode()).toBe("native")
    expect(adapter.supportsHostThemeSync()).toBe(false)
  })
})

describe("DeclarativeAdapter P1-01 browser-facing behavior", () => {
  it.each(["textarea", "contenteditable"] as const)(
    "accepts %s prompt insertion when no submit button is configured",
    (mode) => {
      const manifest = createMinimalManifest()
      manifest.capabilities = ["prompt-insert"]
      manifest.selectors = { textarea: ["[data-editor]"] }
      manifest.input = { mode }
      const adapter = new DeclarativeAdapter(manifest)
      const internals = adapter as unknown as DeclarativeAdapterInputInternals
      const editor = {} as HTMLElement
      vi.spyOn(internals, "getConfiguredEditor").mockReturnValue({ mode, editor })

      if (mode === "contenteditable") {
        const replace = vi.spyOn(internals, "replaceContentEditableContent").mockReturnValue(true)
        expect(adapter.insertPrompt("hello")).toBe(true)
        expect(replace).toHaveBeenCalledWith(editor, "hello", false)
        return
      }

      vi.spyOn(internals, "setTextControlValue").mockReturnValue(true)
      const validate = vi.spyOn(internals, "isEditorUpdateValid").mockReturnValue(true)
      expect(adapter.insertPrompt("hello")).toBe(true)
      expect(validate).toHaveBeenCalledWith(editor, "hello", false)
    },
  )

  it("accepts multi-line content when the contenteditable DOM drops newlines", () => {
    vi.stubGlobal("HTMLInputElement", class {})
    vi.stubGlobal("HTMLTextAreaElement", class {})
    const adapter = new DeclarativeAdapter(createMinimalManifest())
    const internals = adapter as unknown as DeclarativeAdapterInputInternals
    const editor = { isConnected: true, textContent: "line1line2" } as HTMLElement

    expect(internals.isEditorUpdateValid(editor, "line1\nline2", false)).toBe(true)
    expect(internals.isEditorUpdateValid(editor, "missing", false)).toBe(false)
  })

  describe("outline jump scroll pin release", () => {
    const createFakeContainer = () => {
      const listeners = new Map<string, Set<EventListener>>()
      const dispatched: Event[] = []
      return {
        dispatched,
        addEventListener: vi.fn((type: string, listener: EventListener) => {
          listeners.set(type, (listeners.get(type) ?? new Set()).add(listener))
        }),
        removeEventListener: vi.fn((type: string, listener: EventListener) => {
          listeners.get(type)?.delete(listener)
        }),
        dispatchEvent: vi.fn((event: Event) => {
          dispatched.push(event)
          listeners.get(event.type)?.forEach((listener) => listener(event))
          return true
        }),
        emit(type: string) {
          const event = new Event(type)
          listeners.get(type)?.forEach((listener) => listener(event))
        },
      }
    }

    const setupPinRelease = (withFlag: boolean) => {
      vi.useFakeTimers()
      vi.stubGlobal(
        "WheelEvent",
        class extends Event {
          constructor(type: string, init?: EventInit) {
            super(type, init)
          }
        },
      )
      vi.stubGlobal("requestAnimationFrame", (callback: () => void) => {
        callback()
        return 0
      })
      const manifest = createMinimalManifest()
      if (withFlag) manifest.scrollPinRelease = true
      const adapter = new DeclarativeAdapter(manifest)
      const container = createFakeContainer()
      vi.spyOn(adapter, "getScrollContainer").mockReturnValue(container as unknown as HTMLElement)
      const createElement = () =>
        ({ isConnected: true, scrollIntoView: vi.fn() }) as unknown as HTMLElement
      return { adapter, container, createElement }
    }

    it("dispatches a zero-delta wheel after outline jumps to release host auto-pinning", () => {
      const { adapter, container, createElement } = setupPinRelease(true)
      const element = createElement()

      try {
        adapter.scrollToOutlineTarget(element)
        vi.runAllTimers()

        expect(element.scrollIntoView).toHaveBeenCalled()
        expect(container.dispatched.length).toBeGreaterThan(0)
        expect(container.dispatched.every((event) => event instanceof WheelEvent)).toBe(true)
        expect(container.dispatched.every((event) => event.type === "wheel")).toBe(true)
        // 合成 wheel 不应触发“用户接管滚动”的取消逻辑，三次尝试都应派发
        expect(container.dispatched).toHaveLength(3)
      } finally {
        vi.useRealTimers()
      }
    })

    it("does not dispatch wheel or retry when the pack does not declare scrollPinRelease", () => {
      const { adapter, container, createElement } = setupPinRelease(false)
      const element = createElement()

      try {
        adapter.scrollToOutlineTarget(element)
        vi.runAllTimers()

        expect(element.scrollIntoView).toHaveBeenCalledTimes(1)
        expect(container.dispatched).toHaveLength(0)
        expect(container.addEventListener).not.toHaveBeenCalled()
      } finally {
        vi.useRealTimers()
      }
    })

    it("skips stale retries after a newer outline jump", () => {
      const { adapter, createElement } = setupPinRelease(true)
      const first = createElement()
      const second = createElement()

      try {
        adapter.scrollToOutlineTarget(first)
        adapter.scrollToOutlineTarget(second)
        vi.runAllTimers()

        // 第一次跳转只有立即尝试生效，120ms/320ms 的重试被第二次跳转作废
        expect(first.scrollIntoView).toHaveBeenCalledTimes(2)
        expect(second.scrollIntoView).toHaveBeenCalledTimes(4)
      } finally {
        vi.useRealTimers()
      }
    })

    it("cancels pending retries when the user really scrolls during the retry window", () => {
      const { adapter, container, createElement } = setupPinRelease(true)
      const element = createElement()

      try {
        adapter.scrollToOutlineTarget(element)
        container.emit("wheel")
        vi.runAllTimers()

        expect(element.scrollIntoView).toHaveBeenCalledTimes(2)
        expect(container.dispatched).toHaveLength(1)
      } finally {
        vi.useRealTimers()
      }
    })
  })

  interface MatchCase {
    name: string
    pattern: string
    url: string
    expected: boolean
  }

  it.each<MatchCase>([
    {
      name: "exact hosts with an unspecified port",
      pattern: "https://chat.example.com/*",
      url: "https://chat.example.com:8443/conversation",
      expected: true,
    },
    {
      name: "a wildcard host apex",
      pattern: "https://*.example.com/chat/*",
      url: "https://example.com/chat/123?mode=full",
      expected: true,
    },
    {
      name: "a wildcard host subdomain",
      pattern: "https://*.example.com/chat/*",
      url: "https://team.example.com/chat/123",
      expected: true,
    },
    {
      name: "an explicit matching port",
      pattern: "https://chat.example.com:8443/*",
      url: "https://chat.example.com:8443/conversation",
      expected: true,
    },
    {
      name: "an explicit non-matching port",
      pattern: "https://chat.example.com:8443/*",
      url: "https://chat.example.com:9443/conversation",
      expected: false,
    },
    {
      name: "a non-matching path",
      pattern: "https://chat.example.com/chat/*",
      url: "https://chat.example.com/settings",
      expected: false,
    },
    {
      name: "a non-HTTPS URL against an HTTPS pattern",
      pattern: "https://chat.example.com/*",
      url: "http://chat.example.com/conversation",
      expected: false,
    },
    {
      name: "an HTTP pattern on an HTTP URL",
      pattern: "http://127.0.0.1:3080/*",
      url: "http://127.0.0.1:3080/chat",
      expected: true,
    },
    {
      name: "an HTTP pattern on an HTTPS URL",
      pattern: "http://chat.example.com/*",
      url: "https://chat.example.com/conversation",
      expected: false,
    },
  ])("matches $name", ({ pattern, url, expected }) => {
    const manifest = createMinimalManifest()
    manifest.matches = [pattern]
    const adapter = new DeclarativeAdapter(manifest)
    vi.stubGlobal("window", { location: new URL(url) })

    expect(adapter.match()).toBe(expected)
  })

  it("reads the active conversation title through activeMatch and titleSelector", () => {
    const titleElement = { textContent: "  Active\nConversation  " } as Element
    const activeItem = {
      matches: vi.fn((selector: string) => selector === "[aria-current='page']"),
      querySelector: vi.fn((selector: string) =>
        selector === "[data-conversation-title]" ? titleElement : null,
      ),
    } as unknown as Element
    const querySelectorAll = vi.fn(() => [activeItem])
    vi.stubGlobal("document", {
      title: "Fallback Topic - Example Chat",
      documentElement: null,
      querySelectorAll,
    })
    setLanguage("en")
    const adapter = new DeclarativeAdapter(createFullManifest())

    expect(adapter.getConversationTitle()).toBe("Active Conversation")
    expect(querySelectorAll).toHaveBeenCalledWith("nav[data-conversations] a[data-conversation-id]")
  })

  it("falls back to the cleaned document title when there is no active item", () => {
    vi.stubGlobal("document", {
      title: "Fallback Topic - Example Chat",
      documentElement: null,
      querySelectorAll: vi.fn(() => []),
    })
    setLanguage("en")
    const adapter = new DeclarativeAdapter(createFullManifest())

    expect(adapter.getConversationTitle()).toBe("Fallback Topic")
  })

  it("clears contenteditable editor using delete command", () => {
    vi.stubGlobal("HTMLInputElement", class {})
    vi.stubGlobal("HTMLTextAreaElement", class {})
    vi.stubGlobal("HTMLElement", class {})
    vi.stubGlobal(
      "KeyboardEvent",
      class {
        constructor(
          public type: string,
          public options?: KeyboardEventInit,
        ) {}
      },
    )
    vi.stubGlobal(
      "InputEvent",
      class {
        constructor(
          public type: string,
          public options?: InputEventInit,
        ) {}
      },
    )
    vi.stubGlobal(
      "Event",
      class {
        constructor(
          public type: string,
          public options?: EventInit,
        ) {}
      },
    )

    const execCommandMock = vi.fn((cmd: string) => {
      if (cmd === "delete") {
        editor.textContent = ""
        return true
      }
      return false
    })
    const selectionMock = {
      selectAllChildren: vi.fn(),
    }
    const editor = {
      isConnected: true,
      isContentEditable: true,
      textContent: "inserted prompt text",
      focus: vi.fn(),
      dispatchEvent: vi.fn(),
      ownerDocument: {
        execCommand: execCommandMock,
        getSelection: vi.fn(() => selectionMock),
      },
    } as unknown as HTMLElement

    const manifest = createMinimalManifest()
    manifest.input = { mode: "contenteditable", submitKey: "Enter" }
    const adapter = new DeclarativeAdapter(manifest)
    const internals = adapter as unknown as DeclarativeAdapterInputInternals
    vi.spyOn(internals, "getConfiguredEditor").mockReturnValue({
      mode: "contenteditable",
      editor,
    })

    adapter.clearTextarea()

    expect(editor.focus).toHaveBeenCalled()
    expect(selectionMock.selectAllChildren).toHaveBeenCalledWith(editor)
    expect(execCommandMock).toHaveBeenCalledWith("delete", false, undefined)
    // 原生 delete 已清空时直接返回，不再派发合成事件
    expect(editor.dispatchEvent).not.toHaveBeenCalled()
  })

  it("falls back to synthetic event chain when execCommand delete leaves content", () => {
    vi.stubGlobal("HTMLInputElement", class {})
    vi.stubGlobal("HTMLTextAreaElement", class {})
    vi.stubGlobal("HTMLElement", class {})
    vi.stubGlobal(
      "KeyboardEvent",
      class {
        constructor(
          public type: string,
          public options?: KeyboardEventInit,
        ) {}
      },
    )
    vi.stubGlobal(
      "InputEvent",
      class {
        constructor(
          public type: string,
          public options?: InputEventInit,
        ) {}
      },
    )
    vi.stubGlobal(
      "Event",
      class {
        constructor(
          public type: string,
          public options?: EventInit,
        ) {}
      },
    )

    const execCommandMock = vi.fn(() => false)
    const selectionMock = {
      selectAllChildren: vi.fn(),
    }
    const editor = {
      isConnected: true,
      isContentEditable: true,
      textContent: "inserted prompt text",
      focus: vi.fn(),
      dispatchEvent: vi.fn(),
      ownerDocument: {
        execCommand: execCommandMock,
        getSelection: vi.fn(() => selectionMock),
      },
    } as unknown as HTMLElement

    const manifest = createMinimalManifest()
    manifest.input = { mode: "contenteditable", submitKey: "Enter" }
    const adapter = new DeclarativeAdapter(manifest)
    const internals = adapter as unknown as DeclarativeAdapterInputInternals
    vi.spyOn(internals, "getConfiguredEditor").mockReturnValue({
      mode: "contenteditable",
      editor,
    })

    adapter.clearTextarea()

    expect(execCommandMock).toHaveBeenCalledWith("delete", false, undefined)
    expect(editor.dispatchEvent).toHaveBeenCalled()
    // 兜底链最后强写 textContent，确保 DOM 被清空
    expect(editor.textContent).toBe("")
  })

  it("replaces selected content via insertText before dispatching synthetic events", () => {
    vi.stubGlobal("HTMLInputElement", class {})
    vi.stubGlobal("HTMLTextAreaElement", class {})
    vi.stubGlobal("HTMLElement", class {})
    vi.stubGlobal(
      "InputEvent",
      class {
        constructor(
          public type: string,
          public options?: InputEventInit,
        ) {}
      },
    )

    const execCommandMock = vi.fn((cmd: string, _showUI: boolean, value?: string) => {
      if (cmd === "insertText") {
        // 模拟原生编辑管线：全选后插入即整体替换
        editor.textContent = value ?? ""
        return true
      }
      return false
    })
    const selectionMock = {
      selectAllChildren: vi.fn(),
    }
    const editor = {
      isConnected: true,
      isContentEditable: true,
      textContent: "old text",
      focus: vi.fn(),
      dispatchEvent: vi.fn(),
      ownerDocument: {
        execCommand: execCommandMock,
        getSelection: vi.fn(() => selectionMock),
      },
    } as unknown as HTMLElement

    const manifest = createMinimalManifest()
    manifest.input = { mode: "contenteditable", submitKey: "Enter" }
    const adapter = new DeclarativeAdapter(manifest)
    const internals = adapter as unknown as DeclarativeAdapterInputInternals
    vi.spyOn(internals, "getConfiguredEditor").mockReturnValue({
      mode: "contenteditable",
      editor,
    })

    expect(adapter.insertPrompt("new prompt")).toBe(true)
    expect(execCommandMock).toHaveBeenCalledWith("insertText", false, "new prompt")
    expect(editor.textContent).toBe("new prompt")
    // 原生插入成功时不再派发合成 beforeinput
    expect(editor.dispatchEvent).not.toHaveBeenCalled()
  })
})
