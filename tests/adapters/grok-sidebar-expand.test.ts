import { afterEach, describe, expect, it, vi } from "vitest"

// DOMToolkit 在模块加载时读取全局 document；node 环境提供最小 stub
vi.hoisted(() => {
  const globalRef = globalThis as Record<string, unknown>
  globalRef.document ??= { documentElement: {}, body: {} }
})

import { GrokAdapter } from "~adapters/grok"

vi.mock("~utils/export-assets", () => ({
  createExportAssetCollector: vi.fn(() => ({ assets: [], usedPaths: new Set() })),
  formatExportFileAttachments: vi.fn(() => ""),
  formatExportImageAttachments: vi.fn(() => ""),
  isDownloadableExportAssetUrl: vi.fn(() => false),
  normalizeExportAssetUrl: vi.fn(() => null),
}))

vi.mock("~utils/exporter", () => ({
  htmlToMarkdown: vi.fn(() => ""),
}))

vi.mock("~utils/i18n", () => ({
  t: (key: string) => key,
}))

const TRIGGER_SELECTOR = 'button[data-sidebar="trigger"]'
const CONTENT_SELECTOR = '[data-sidebar="content"]'
const CONVERSATION_ITEM = 'a[href^="/c/"]'

interface SidebarState {
  expanded: boolean
}

/**
 * 最小假 document：模拟 Grok 侧边栏折叠（icon 模式）结构。
 * 折叠时 content 容器在 DOM 但不渲染对话条目；trigger.click() 模拟站点展开。
 */
const createSidebarDocument = (state: SidebarState, withTrigger = true) => {
  const collapsedWrapper = {} as Element
  const sidebar = {
    querySelector: (selector: string) =>
      selector === CONVERSATION_ITEM && state.expanded ? ({} as Element) : null,
  }
  const trigger = {
    click: vi.fn(() => {
      state.expanded = true
    }),
    getAttribute: (name: string) =>
      name === "data-state" ? (state.expanded ? "open" : "closed") : null,
    closest: (selector: string) =>
      selector === '[data-state="collapsed"]' && !state.expanded ? collapsedWrapper : null,
  }
  const doc = {
    querySelector: (selector: string) => {
      if (selector === TRIGGER_SELECTOR) return withTrigger ? trigger : null
      if (selector === CONTENT_SELECTOR) return sidebar
      return null
    },
  }
  return { trigger, doc: doc as unknown as Document }
}

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe("GrokAdapter sidebar expansion before sync", () => {
  it("clicks the trigger to expand a collapsed sidebar", async () => {
    const state: SidebarState = { expanded: false }
    const { trigger, doc } = createSidebarDocument(state)
    vi.stubGlobal("document", doc)

    const adapter = new GrokAdapter()
    await adapter.loadAllConversations()

    expect(trigger.click).toHaveBeenCalledTimes(1)
    expect(state.expanded).toBe(true)
  })

  it("leaves an already expanded sidebar untouched", async () => {
    const state: SidebarState = { expanded: true }
    const { trigger, doc } = createSidebarDocument(state)
    vi.stubGlobal("document", doc)

    const adapter = new GrokAdapter()
    await adapter.loadAllConversations()

    expect(trigger.click).not.toHaveBeenCalled()
  })

  it("does nothing when the sidebar trigger is absent", async () => {
    const state: SidebarState = { expanded: false }
    const { doc } = createSidebarDocument(state, false)
    vi.stubGlobal("document", doc)

    const adapter = new GrokAdapter()
    await expect(adapter.loadAllConversations()).resolves.toBeUndefined()
    expect(state.expanded).toBe(false)
  })
})
