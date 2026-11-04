import { beforeEach, describe, expect, it, vi } from "vitest"

import type { SiteAdapter } from "~adapters/base"
import { TabManager } from "~core/tab-manager"
import { extractConversationTitleFromDocumentTitle } from "~utils/conversation-title"
import type { Settings } from "~utils/storage"

vi.mock("~adapters/base", () => ({}))
vi.mock("~platform", () => ({ platform: {} }))
vi.mock("~constants", () => ({ NOTIFICATION_SOUND_PRESETS: [] }))
vi.mock("~utils/i18n", () => ({ t: (key: string) => key }))

let pageDocument: EventTarget & {
  title: string
  hidden: boolean
  hasFocus: () => boolean
  documentElement: {
    setAttribute: (name: string, value: string) => void
    getAttribute: (name: string) => string | null
    hasAttribute: (name: string) => boolean
    removeAttribute: (name: string) => void
  }
}

function createManager(overrides: Partial<Settings["tab"]> = {}) {
  const getTitle = () =>
    extractConversationTitleFromDocumentTitle(pageDocument.title, {
      siteName: "ChatGPT",
      rejectManagedTitle: true,
    })
  const adapter = {
    getName: () => "ChatGPT",
    getConversationTitle: getTitle,
    getSessionName: getTitle,
    isNewConversation: () => false,
    isGenerating: () => false,
    setNetworkGenerationState: () => {},
  } as unknown as SiteAdapter
  return new TabManager(adapter, {
    autoRename: true,
    showStatus: true,
    titleFormat: "{status}{title}",
    ...overrides,
  } as Settings["tab"])
}

beforeEach(() => {
  vi.useFakeTimers()
  const attributes = new Map<string, string>()
  pageDocument = Object.assign(new EventTarget(), {
    title: "设置",
    hidden: false,
    hasFocus: () => true,
    documentElement: {
      setAttribute: (name: string, value: string) => void attributes.set(name, value),
      getAttribute: (name: string) => attributes.get(name) ?? null,
      hasAttribute: (name: string) => attributes.has(name),
      removeAttribute: (name: string) => void attributes.delete(name),
    },
  })
  vi.stubGlobal("document", pageDocument)
  vi.stubGlobal("window", Object.assign(new EventTarget(), { setTimeout, clearTimeout }))
})

describe("TabManager title ownership", () => {
  it("restores native provenance while a route is waiting for its new title", () => {
    const manager = createManager()
    manager.start()
    manager.resetConversationTitleCache()
    manager.updateTabName()
    manager.destroy()
    expect(pageDocument.title).toBe("设置")
  })

  it("restores a new route's native title after navigation", () => {
    const manager = createManager()
    manager.start()
    manager.resetConversationTitleCache()
    pageDocument.title = "新页面"
    manager.updateTabName()
    manager.destroy()
    expect(pageDocument.title).toBe("新页面")
  })
  it.each([
    { titleFormat: "{status}{title}" },
    { titleFormat: "{status}{title} | {site}" },
    { privacyMode: true, privacyTitle: "Google" },
  ])("restores native titles across repeated disable/enable cycles: %j", (settings) => {
    for (let cycle = 0; cycle < 4; cycle++) {
      const manager = createManager(settings)
      manager.start()
      manager.destroy()
      expect(pageDocument.title).toBe("设置")
    }
  })

  it("does not accumulate status markers when restarting the same manager", () => {
    const manager = createManager()
    for (let cycle = 0; cycle < 4; cycle++) {
      manager.start()
      expect(pageDocument.title).toBe("✅ 设置")
      manager.stop()
      expect(pageDocument.title).toBe("设置")
    }
    manager.destroy()
  })

  it("preserves newer site titles on stop", () => {
    const manager = createManager()
    manager.start()
    pageDocument.title = "新页面"
    manager.destroy()
    expect(pageDocument.title).toBe("新页面")
  })

  it("restores the latest native title after a site title update", () => {
    const manager = createManager()
    manager.start()
    pageDocument.title = "新页面"
    manager.updateTabName()
    expect(pageDocument.title).toBe("✅ 新页面")
    manager.destroy()
    expect(pageDocument.title).toBe("新页面")
  })

  it("preserves native titles that start with a status emoji", () => {
    pageDocument.title = "✅ 我的清单"
    const manager = createManager()
    manager.start()
    expect(pageDocument.title).toBe("✅ ✅ 我的清单")
    manager.destroy()
    expect(pageDocument.title).toBe("✅ 我的清单")
  })

  it.each([
    { titleFormat: "{status}{title}" },
    { titleFormat: "{status}{title} :: {site}" },
    { privacyMode: true, privacyTitle: "Google" },
  ])("retains native provenance on reinjection: %j", (settings) => {
    const previous = createManager(settings)
    previous.start()
    const firstManagedTitle = pageDocument.title
    const replacement = createManager(settings)
    replacement.start()
    expect(pageDocument.title).toBe(firstManagedTitle)
    replacement.destroy()
    expect(pageDocument.title).toBe("设置")
    previous.destroy()
  })
})
