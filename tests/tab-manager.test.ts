import { beforeEach, describe, expect, it, vi } from "vitest"

import type { SiteAdapter } from "~adapters/base"
import { TabManager } from "~core/tab-manager"
import {
  GEMINI_NATIVE_TAB_TITLE_ATTR,
  GEMINI_NATIVE_TAB_TITLE_PATH_ATTR,
  extractConversationTitleFromDocumentTitle,
} from "~utils/conversation-title"
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

let pageWindow: EventTarget & { location: { pathname: string } }

function createManager(
  overrides: Partial<Settings["tab"]> = {},
  adapterOverrides: Partial<SiteAdapter> = {},
) {
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
    ...adapterOverrides,
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
  pageWindow = Object.assign(new EventTarget(), {
    setTimeout,
    clearTimeout,
    location: { pathname: "/" },
  })
  vi.stubGlobal("window", pageWindow)
})

describe("TabManager title ownership", () => {
  it("preserves native provenance when the sidebar updates before the document title", () => {
    let sidebarTitle: string | null = "设置"
    const manager = createManager({}, { getConversationTitle: () => sidebarTitle })
    manager.start()
    manager.resetConversationTitleCache()
    sidebarTitle = "新对话"
    manager.updateTabName()
    expect(pageDocument.title).toBe("✅ 新对话")

    manager.stop()
    expect(pageDocument.title).toBe("设置")
    sidebarTitle = null
    manager.start()
    expect(pageDocument.title).toBe("✅ 设置")

    pageDocument.title = "新对话"
    manager.updateTabName()
    manager.destroy()
    expect(pageDocument.title).toBe("新对话")
  })

  it.each([true, false])(
    "manages privacy titles independently of auto-rename: %s",
    (autoRename) => {
      const settings = { autoRename, privacyMode: true, privacyTitle: "Google" }
      const manager = createManager(settings)
      manager.start()
      expect(pageDocument.title).toBe("Google")

      manager.updateSettings({ ...settings, autoRename: false } as Settings["tab"])
      expect(pageDocument.title).toBe("Google")
      manager.updateSettings({
        ...settings,
        autoRename: false,
        privacyTitle: "Work",
      } as Settings["tab"])
      expect(pageDocument.title).toBe("Work")

      manager.updateSettings({
        ...settings,
        autoRename: false,
        privacyMode: false,
      } as Settings["tab"])
      expect(pageDocument.title).toBe("设置")
      manager.destroy()
    },
  )

  it("restores native provenance while a route is waiting for its new title", () => {
    const manager = createManager()
    manager.start()
    manager.resetConversationTitleCache()
    manager.updateTabName()
    manager.destroy()
    expect(pageDocument.title).toBe("设置")
  })

  it("restores native provenance when toggled inside the route-change window", () => {
    const manager = createManager()
    manager.start()
    expect(pageDocument.title).toBe("✅ 设置")

    manager.resetConversationTitleCache()
    manager.stop()
    expect(pageDocument.title).toBe("设置")

    manager.start()
    expect(pageDocument.title).toBe("✅ 设置")
    manager.destroy()
    expect(pageDocument.title).toBe("设置")
  })

  it("retains native provenance when reinjected inside the route-change window", () => {
    const previous = createManager()
    previous.start()
    expect(pageDocument.title).toBe("✅ 设置")

    // 浏览器直接停用扩展时不执行 destroy；DOM 上的 stale 标记仍然保留
    previous.resetConversationTitleCache()
    const replacement = createManager()
    replacement.start()
    expect(pageDocument.title).not.toContain("✅ ✅")
    replacement.destroy()
    expect(pageDocument.title).toBe("设置")
    previous.destroy()
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

  it("restores the Gemini guard's latest native title on stop", () => {
    const manager = createManager()
    manager.start()
    expect(pageDocument.title).toBe("✅ 设置")

    // Gemini 主世界 guard 拦截站点标题更新，最新原生标题只记录在 guard 的属性里
    pageDocument.documentElement.setAttribute(GEMINI_NATIVE_TAB_TITLE_ATTR, "新对话")
    pageDocument.documentElement.setAttribute(GEMINI_NATIVE_TAB_TITLE_PATH_ATTR, "/app/123")
    pageWindow.location.pathname = "/app/123"

    manager.stop()
    expect(pageDocument.title).toBe("新对话")
    manager.destroy()
  })

  it("ignores the Gemini guard's native title recorded for a different page", () => {
    const manager = createManager()
    manager.start()
    expect(pageDocument.title).toBe("✅ 设置")

    pageDocument.documentElement.setAttribute(GEMINI_NATIVE_TAB_TITLE_ATTR, "旧页面")
    pageDocument.documentElement.setAttribute(GEMINI_NATIVE_TAB_TITLE_PATH_ATTR, "/app/old")
    pageWindow.location.pathname = "/app/123"

    manager.stop()
    expect(pageDocument.title).toBe("设置")
    manager.destroy()
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
