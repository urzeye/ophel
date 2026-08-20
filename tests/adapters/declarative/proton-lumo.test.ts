import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import protonLumoManifest from "../../../registry/sites/proton-lumo.json"
import { DeclarativeAdapter } from "~adapters/declarative/adapter"
import type { SitePackManifest } from "~adapters/declarative/types"

vi.mock("~utils/dom-toolkit", () => ({
  DOMToolkit: {
    query: vi.fn(),
  },
}))

describe("Proton Lumo SitePack", () => {
  let adapter: DeclarativeAdapter

  beforeEach(() => {
    vi.stubGlobal("window", {
      location: new URL("https://lumo.proton.me/u/1/c/4067881c-9376-477e-bd13-9432c9dc539e"),
    })
    adapter = new DeclarativeAdapter(protonLumoManifest as unknown as SitePackManifest)
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it("matches Proton Lumo URLs for different user accounts", () => {
    expect(adapter.match()).toBe(true)

    vi.stubGlobal("window", {
      location: new URL("https://lumo.proton.me/u/2/c/4067881c-9376-477e-bd13-9432c9dc539e"),
    })
    expect(adapter.match()).toBe(true)

    vi.stubGlobal("window", {
      location: new URL("https://other.proton.me/u/1/c/4067881c-9376-477e-bd13-9432c9dc539e"),
    })
    expect(adapter.match()).toBe(false)
  })

  it("extracts session ID and detects new conversation paths", () => {
    expect(adapter.getSessionId()).toBe("4067881c-9376-477e-bd13-9432c9dc539e")
    expect(adapter.isNewConversation()).toBe(false)

    vi.stubGlobal("window", {
      location: new URL("https://lumo.proton.me/u/1"),
    })
    expect(adapter.getSessionId()).toBe("")
    expect(adapter.isNewConversation()).toBe(true)

    vi.stubGlobal("window", {
      location: new URL("https://lumo.proton.me/u/2/"),
    })
    expect(adapter.isNewConversation()).toBe(true)

    vi.stubGlobal("window", {
      location: new URL("https://lumo.proton.me/"),
    })
    expect(adapter.isNewConversation()).toBe(true)
  })

  it("exposes correct capabilities without conversation-list or reading-history", () => {
    const capabilities = adapter.getFeatureCapabilities()
    expect(capabilities.has("outline")).toBe(true)
    expect(capabilities.has("outline-user-queries")).toBe(true)
    expect(capabilities.has("export-basic")).toBe(true)
    expect(capabilities.has("generation-detect")).toBe(true)
    expect(capabilities.has("new-chat")).toBe(true)
    expect(capabilities.has("stop-generation")).toBe(true)
    expect(capabilities.has("width")).toBe(true)
    expect(capabilities.has("zen")).toBe(true)
    expect(capabilities.has("clean")).toBe(true)
    expect(capabilities.has("prompt-insert")).toBe(true)

    expect(capabilities.has("conversation-list")).toBe(false)
    expect(capabilities.has("reading-history")).toBe(false)

    expect(adapter.getTextareaSelectors()).toContain("textarea.composer")
    expect(adapter.getResponseContainerSelector()).toBe(".lumo-message-chain")
    expect(adapter.getUserQuerySelector()).toBe(
      ".lumo-chat-item[data-message-role='user'] .user-msg-container .lumo-markdown",
    )
    expect(adapter.getChatContentSelectors()).toContain(".lumo-chat-item[data-message-role]")
  })
})
