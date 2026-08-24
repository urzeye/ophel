import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import notionAiManifest from "../../../registry/sites/notion-ai.json"
import { DeclarativeAdapter } from "~adapters/declarative/adapter"
import type { SitePackManifest } from "~adapters/declarative/types"

vi.mock("~utils/dom-toolkit", () => ({
  DOMToolkit: {
    query: vi.fn(),
  },
}))

describe("Notion AI SitePack", () => {
  let adapter: DeclarativeAdapter

  beforeEach(() => {
    vi.stubGlobal("window", {
      location: new URL("https://app.notion.com/chat?t=3c64cc9533cc8074b3ab00a907c24733"),
    })
    adapter = new DeclarativeAdapter(notionAiManifest as unknown as SitePackManifest)
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it("matches Notion AI chat and ai paths on app.notion.com, but excludes normal Notion pages and notion.so", () => {
    expect(adapter.match()).toBe(true)

    vi.stubGlobal("window", {
      location: new URL("https://app.notion.com/ai"),
    })
    expect(adapter.match()).toBe(true)

    vi.stubGlobal("window", {
      location: new URL("https://app.notion.com/ai/"),
    })
    expect(adapter.match()).toBe(true)

    vi.stubGlobal("window", {
      location: new URL("https://app.notion.com/home"),
    })
    expect(adapter.match()).toBe(false)

    vi.stubGlobal("window", {
      location: new URL("https://app.notion.com/workspace-name/my-document-123"),
    })
    expect(adapter.match()).toBe(false)

    vi.stubGlobal("window", {
      location: new URL("https://www.notion.so/ai"),
    })
    expect(adapter.match()).toBe(false)

    vi.stubGlobal("window", {
      location: new URL("https://other.notion.com/ai"),
    })
    expect(adapter.match()).toBe(false)
  })

  it("detects new conversation and chat paths", () => {
    expect(adapter.isNewConversation()).toBe(false)

    vi.stubGlobal("window", {
      location: new URL("https://app.notion.com/ai"),
    })
    expect(adapter.isNewConversation()).toBe(true)

    vi.stubGlobal("window", {
      location: new URL("https://app.notion.com/ai/"),
    })
    expect(adapter.isNewConversation()).toBe(true)
  })

  it("exposes correct capabilities without conversation-list, reading-history, or document-outline", () => {
    const capabilities = adapter.getFeatureCapabilities()
    expect(capabilities.has("outline")).toBe(true)
    expect(capabilities.has("outline-user-queries")).toBe(true)
    expect(capabilities.has("export-basic")).toBe(true)
    expect(capabilities.has("new-chat")).toBe(true)
    expect(capabilities.has("width")).toBe(true)
    expect(capabilities.has("zen")).toBe(true)
    expect(capabilities.has("prompt-insert")).toBe(true)

    expect(capabilities.has("conversation-list")).toBe(false)
    expect(capabilities.has("reading-history")).toBe(false)
    expect(capabilities.has("document-outline")).toBe(false)
    expect(capabilities.has("model-lock")).toBe(false)

    expect(adapter.getTextareaSelectors()).toContain("div[contenteditable='true'][role='textbox']")
    expect(adapter.getResponseContainerSelector()).toBe(
      ".layout-content .notion-selectable-container",
    )
    expect(adapter.getUserQuerySelector()).toBe(
      "div[data-agent-chat-user-step-id] [data-content-editable-leaf='true']",
    )
    expect(adapter.getNewChatButtonSelectors()).toContain("div[data-inp-target='sidebar-new-chat']")
    expect(adapter.getSubmitButtonSelectors()).toContain(
      "div[data-testid='agent-send-message-button']",
    )
    expect(adapter.getChatContentSelectors()).toContain("div[data-agent-chat-user-step-id]")
    expect(adapter.getChatContentSelectors()).toContain("div[data-block-id]")

    const exportConfig = adapter.getExportConfig()
    expect(exportConfig?.userQuerySelector).toBe(
      "div[data-agent-chat-user-step-id] [data-content-editable-leaf='true']",
    )
    expect(exportConfig?.assistantResponseSelector).toBe("div[data-content-editable-root='true']")

    const zenConfig = adapter.getZenModeConfig()
    expect(zenConfig?.hide).toContain(".notion-sidebar-container")
  })

  it("extracts clean display and visitable entry URL for Notion AI and match patterns", async () => {
    const { siteMatchPatternDisplayUrl } = await import("~adapters/declarative/match-pattern")
    expect(siteMatchPatternDisplayUrl(notionAiManifest.matches[0])).toBe(
      "https://app.notion.com/ai",
    )
    expect(siteMatchPatternDisplayUrl(notionAiManifest.matches[1])).toBe(
      "https://app.notion.com/chat",
    )
    expect(siteMatchPatternDisplayUrl("https://chatgpt.com/*")).toBe("https://chatgpt.com")
    expect(siteMatchPatternDisplayUrl("https://*.notion.com/ai*")).toBe("https://notion.com/ai")
  })
})
