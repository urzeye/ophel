import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import wenxinManifest from "../../../registry/sites/wenxin.json"
import { DeclarativeAdapter } from "~adapters/declarative/adapter"
import type { SitePackManifest } from "~adapters/declarative/types"
import { validateSitePackManifest } from "~adapters/declarative/validate"

vi.mock("~utils/dom-toolkit", () => ({
  DOMToolkit: {
    query: vi.fn(),
  },
}))

const NEW_CHAT_URL = "https://wenxin.baidu.com/"
const EXISTING_CHAT_URL = "https://wenxin.baidu.com/search/13173937630652015742"
const SHARE_URL = "https://mr.baidu.com/r/21R8f4jmJLG?f=ot&u=3cc3bc3ded25079b"
const BASIC_CAPABILITIES = [
  "outline",
  "outline-user-queries",
  "export-basic",
  "new-chat",
  "width",
  "zen",
  "prompt-insert",
] as const

describe("Baidu Wenxin SitePack", () => {
  let adapter: DeclarativeAdapter

  beforeEach(() => {
    vi.stubGlobal("window", {
      location: new URL(EXISTING_CHAT_URL),
    })
    adapter = new DeclarativeAdapter(wenxinManifest as unknown as SitePackManifest)
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it("loads the shipped registry JSON through runtime validation", () => {
    const result = validateSitePackManifest(wenxinManifest)
    expect(result.valid).toBe(true)
    if (!result.valid) {
      throw new Error("Expected Wenxin SitePack to validate: " + JSON.stringify(result.errors))
    }
    expect(result.value.id).toBe("wenxin")
    expect(result.value.name).toBe("百度文心")
    expect("$schema" in wenxinManifest).toBe(false)
    expect("disabled" in wenxinManifest).toBe(false)
  })

  it("matches Wenxin conversation URLs, but excludes share and unrelated hosts", () => {
    expect(adapter.match()).toBe(true)

    vi.stubGlobal("window", {
      location: new URL(NEW_CHAT_URL),
    })
    expect(adapter.match()).toBe(true)

    vi.stubGlobal("window", {
      location: new URL(SHARE_URL),
    })
    expect(adapter.match()).toBe(false)

    vi.stubGlobal("window", {
      location: new URL("https://www.baidu.com/"),
    })
    expect(adapter.match()).toBe(false)

    vi.stubGlobal("window", {
      location: new URL("https://chat.baidu.com/"),
    })
    expect(adapter.match()).toBe(false)

    vi.stubGlobal("window", {
      location: new URL("https://mr.baidu.com/"),
    })
    expect(adapter.match()).toBe(false)
  })

  it("extracts session ID and detects new conversation paths", () => {
    expect(adapter.getSessionId()).toBe("13173937630652015742")
    expect(adapter.isNewConversation()).toBe(false)
    expect(adapter.isSharePage()).toBe(false)

    vi.stubGlobal("window", {
      location: new URL(NEW_CHAT_URL),
    })
    expect(adapter.getSessionId()).toBe("")
    expect(adapter.isNewConversation()).toBe(true)
    expect(adapter.isSharePage()).toBe(false)
  })

  it("exposes the basic capability set and required selector fields", () => {
    const capabilities = adapter.getFeatureCapabilities()
    expect(capabilities.size).toBe(BASIC_CAPABILITIES.length)
    for (const capability of BASIC_CAPABILITIES) {
      expect(capabilities.has(capability)).toBe(true)
    }

    expect(capabilities.has("reading-history")).toBe(false)
    expect(capabilities.has("conversation-list")).toBe(false)
    expect(capabilities.has("generation-detect")).toBe(false)
    expect(capabilities.has("stop-generation")).toBe(false)
    expect(capabilities.has("model-lock")).toBe(false)
    expect(capabilities.has("clean")).toBe(false)
    expect(capabilities.has("document-outline")).toBe(false)
    expect(capabilities.has("panel-avoidance")).toBe(false)

    expect(adapter.getTextareaSelectors()).toContain("#chat-textarea")
    expect(adapter.getResponseContainerSelector()).toBe("#conversation-flow-container")
    expect(adapter.getUserQuerySelector()).toBe(".cs-question-pure-text")
    expect(adapter.getNewChatButtonSelectors()).toContain(".new-dialog-container-button")
    expect(adapter.getSubmitButtonSelectors()).toContain("#ci-submit-button-ai")
    expect(adapter.getSubmitKeyConfig().key).toBe("Enter")
    expect(wenxinManifest.input.mode).toBe("textarea")
    expect(wenxinManifest.selectors.assistantResponse).toBe(".ai-markdown")

    const exportConfig = adapter.getExportConfig()
    expect(exportConfig?.userQuerySelector).toBe(".cs-question-pure-text")
    expect(exportConfig?.assistantResponseSelector).toBe(".ai-markdown")
    expect(exportConfig?.turnSelector).toBeNull()

    const zenConfig = adapter.getZenModeConfig()
    expect(zenConfig?.hide?.length).toBeGreaterThan(0)
    expect(zenConfig?.hide).toContain(".chat-aside-container")

    const widthSelectors = adapter.getWidthSelectors()
    expect(widthSelectors.length).toBeGreaterThan(0)
    expect(widthSelectors.every((item) => item.selector && item.property)).toBe(true)
  })
})
