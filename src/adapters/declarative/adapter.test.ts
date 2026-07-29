import { afterEach, describe, expect, it, vi } from "vitest"

import exampleManifest from "../../../registry/examples/site-pack.example.json"
import { setLanguage } from "~utils/i18n"

import { DeclarativeAdapter } from "./adapter"
import type { SitePackManifest } from "./types"

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

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  setLanguage("en")
})

describe("DeclarativeAdapter direct mappings", () => {
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
      name: "a non-HTTPS URL",
      pattern: "https://chat.example.com/*",
      url: "http://chat.example.com/conversation",
      expected: false,
    },
  ])("matches $name", ({ pattern, url, expected }) => {
    const manifest = createMinimalManifest()
    manifest.matches = [pattern]
    const adapter = new DeclarativeAdapter(manifest)
    vi.stubGlobal("window", { location: new URL(url) })

    expect(adapter.match()).toBe(expected)
  })

  it("does not use detect rules when static matches fail", () => {
    const manifest = createMinimalManifest()
    manifest.matches = ["https://other.example.com/*"]
    manifest.detect = [{ selectorExists: "main" }]
    const adapter = new DeclarativeAdapter(manifest)
    vi.stubGlobal("window", { location: new URL("https://minimal.example.com/") })

    expect(adapter.match()).toBe(false)
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
})
