import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import manusManifest from "../../../registry/sites/manus.json"
import { DeclarativeAdapter } from "~adapters/declarative/adapter"
import type { SitePackManifest } from "~adapters/declarative/types"

vi.mock("~utils/dom-toolkit", () => ({
  DOMToolkit: {
    query: vi.fn(),
  },
}))

describe("Manus SitePack", () => {
  let adapter: DeclarativeAdapter

  beforeEach(() => {
    vi.stubGlobal("window", {
      location: new URL("https://manus.im/app/mvsEobPwEw6GGmBHHaeiwX"),
    })
    adapter = new DeclarativeAdapter(manusManifest as unknown as SitePackManifest)
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it("matches Manus URLs", () => {
    expect(adapter.match()).toBe(true)

    vi.stubGlobal("window", {
      location: new URL("https://manus.im/share/mvsEobPwEw6GGmBHHaeiwX"),
    })
    expect(adapter.match()).toBe(true)

    vi.stubGlobal("window", {
      location: new URL("https://other.im/app/mvsEobPwEw6GGmBHHaeiwX"),
    })
    expect(adapter.match()).toBe(false)
  })

  it("extracts session ID and detects new conversation and share paths", () => {
    expect(adapter.getSessionId()).toBe("mvsEobPwEw6GGmBHHaeiwX")
    expect(adapter.isNewConversation()).toBe(false)
    expect(adapter.isSharePage()).toBe(false)

    vi.stubGlobal("window", {
      location: new URL("https://manus.im/share/mvsEobPwEw6GGmBHHaeiwX"),
    })
    expect(adapter.getSessionId()).toBe("mvsEobPwEw6GGmBHHaeiwX")
    expect(adapter.isSharePage()).toBe(true)

    vi.stubGlobal("window", {
      location: new URL("https://manus.im/app"),
    })
    expect(adapter.getSessionId()).toBe("")
    expect(adapter.isNewConversation()).toBe(true)

    vi.stubGlobal("window", {
      location: new URL("https://manus.im/app/"),
    })
    expect(adapter.isNewConversation()).toBe(true)

    vi.stubGlobal("window", {
      location: new URL("https://manus.im/"),
    })
    expect(adapter.isNewConversation()).toBe(true)
  })

  it("exposes correct capabilities and selectors", () => {
    const capabilities = adapter.getFeatureCapabilities()
    expect(capabilities.has("outline")).toBe(true)
    expect(capabilities.has("outline-user-queries")).toBe(true)
    expect(capabilities.has("export-basic")).toBe(true)
    expect(capabilities.has("new-chat")).toBe(true)
    expect(capabilities.has("width")).toBe(true)
    expect(capabilities.has("zen")).toBe(true)
    expect(capabilities.has("clean")).toBe(true)
    expect(capabilities.has("prompt-insert")).toBe(true)

    expect(capabilities.has("conversation-list")).toBe(false)
    expect(capabilities.has("reading-history")).toBe(false)

    expect(adapter.getTextareaSelectors()).toContain(".chat-input-editor [contenteditable='true']")
    expect(adapter.getResponseContainerSelector()).toBe("div[class*='--chat-message-list']")
    expect(adapter.getUserQuerySelector()).toBe("[data-chat-question-bubble='true']")
    expect(adapter.getExportConfig()?.assistantResponseSelector).toBe(".manus-markdown")
  })
})
