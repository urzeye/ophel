import { afterEach, describe, expect, it, vi } from "vitest"

import { DeepSeekAdapter } from "~adapters/deepseek"
import { DoubaoAdapter } from "~adapters/doubao"

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

vi.mock("~utils/dom-toolkit", () => ({
  DOMToolkit: {
    query: vi.fn(),
  },
}))

vi.mock("~utils/i18n", () => ({
  t: (key: string) => key,
}))

/** 最小结构 DOM 桩：只实现适配器读取会话列表用到的 API 面 */
class StubElement {
  parentElement: StubElement | null = null
  readonly children: StubElement[] = []
  textContent = ""
  private readonly attrs = new Map<string, string>()

  constructor(private readonly selector: string) {}

  static el(selector: string, textContent = ""): StubElement {
    const el = new StubElement(selector)
    el.textContent = textContent
    return el
  }

  append(...children: StubElement[]): this {
    for (const child of children) {
      child.parentElement = this
      this.children.push(child)
    }
    return this
  }

  setAttribute(name: string, value: string): this {
    this.attrs.set(name, value)
    return this
  }

  removeAttribute(name: string): void {
    this.attrs.delete(name)
  }

  readonly classList = {
    remove: (): void => {},
  }

  getAttribute(name: string): string | null {
    return this.attrs.get(name) ?? null
  }

  matches(selector: string): boolean {
    return selector.split(",").some((part) => part.trim() === this.selector)
  }

  closest(selector: string): StubElement | null {
    return this.matches(selector) ? this : this.parentElement?.closest(selector) ?? null
  }

  querySelector(selector: string): StubElement | null {
    return this.querySelectorAll(selector)[0] ?? null
  }

  querySelectorAll(selector: string): StubElement[] {
    return this.children.flatMap((child) => [
      ...(child.matches(selector) ? [child] : []),
      ...child.querySelectorAll(selector),
    ])
  }
}

class MemoryStorage {
  private readonly data = new Map<string, string>()

  get length(): number {
    return this.data.size
  }

  key(index: number): string | null {
    return Array.from(this.data.keys())[index] ?? null
  }

  getItem(key: string): string | null {
    return this.data.get(key) ?? null
  }
}

const installDocument = (body: StubElement): void => {
  vi.stubGlobal("document", {
    body,
    querySelectorAll: (selector: string) => body.querySelectorAll(selector),
  })
}

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe("DeepSeek pinned conversations in the redesigned sidebar", () => {
  const LINK_SELECTOR = 'a[href*="/a/chat/s/"]'

  const createLink = (id: string, title: string): StubElement =>
    StubElement.el(LINK_SELECTOR)
      .setAttribute("href", `/a/chat/s/${id}`)
      .setAttribute("aria-label", title)

  const buildSidebar = (): { body: StubElement; pinned: StubElement; recent: StubElement } => {
    const pinned = createLink("pinned-1", "Pinned chat")
    const recent = createLink("recent-1", "Recent chat")

    // 置顶分组：标题 + 额外包裹的会话列表（参照 deepseek-side.html）
    const pinnedGroup = StubElement.el("div").append(
      StubElement.el("div", "置顶"),
      StubElement.el("div").append(StubElement.el("div").append(pinned, StubElement.el("div"))),
    )
    // 日期分组：标题与会话同为分组直接子节点
    const dateGroup = StubElement.el("div").append(StubElement.el("div", "今天"), recent)

    const body = StubElement.el("body").append(StubElement.el("div").append(pinnedGroup, dateGroup))
    return { body, pinned, recent }
  }

  it("marks wrapped conversations as pinned and direct group children as unpinned", () => {
    vi.stubGlobal("window", { location: new URL("https://chat.deepseek.com/") })
    vi.stubGlobal("localStorage", new MemoryStorage())
    const { body, pinned, recent } = buildSidebar()
    installDocument(body)

    const list = new DeepSeekAdapter().getConversationList()
    const byId = new Map(list.map((item) => [item.id, item]))

    expect(byId.get("pinned-1")?.isPinned).toBe(true)
    expect(byId.get("recent-1")?.isPinned).toBe(false)
    expect(pinned.parentElement).not.toBe(recent.parentElement)
  })

  it("does not mark conversations outside any group as pinned", () => {
    vi.stubGlobal("window", { location: new URL("https://chat.deepseek.com/") })
    vi.stubGlobal("localStorage", new MemoryStorage())
    const loose = createLink("loose-1", "Loose chat")
    const body = StubElement.el("body").append(StubElement.el("div").append(loose))
    installDocument(body)

    const list = new DeepSeekAdapter().getConversationList()
    expect(list.find((item) => item.id === "loose-1")?.isPinned).toBe(false)
  })
})

describe("Doubao pinned conversations in the redesigned sidebar", () => {
  const LINK_SELECTOR = '#flow_chat_sidebar a[id^="conversation_"][href*="/chat/"]'
  const SECTION_SELECTOR = "#flow_chat_sidebar section"
  const HEADER_SELECTOR = '[class*="group/section-header"]'

  const createLink = (id: string, title: string): StubElement =>
    StubElement.el(LINK_SELECTOR)
      .setAttribute("id", `conversation_${id}`)
      .setAttribute("href", `/chat/${id}`)
      .append(StubElement.el("span", title))

  const createSection = (label: string, links: StubElement[]): StubElement =>
    StubElement.el(SECTION_SELECTOR).append(
      StubElement.el(HEADER_SELECTOR, label),
      ...links.map((link) => StubElement.el("div").append(link)),
    )

  it("marks conversations under the pinned section header as pinned", () => {
    vi.stubGlobal("window", { location: new URL("https://www.doubao.com/chat/") })
    const pinnedSection = createSection("置顶", [createLink("111", "置顶会话")])
    const recentSection = createSection("最近", [createLink("222", "普通会话")])
    // 参照 doubao-side.html：置顶、最近分区结构完全一致，只能靠分区标题区分
    const body = StubElement.el("body").append(
      StubElement.el("div").append(pinnedSection, recentSection),
    )
    installDocument(body)

    const list = new DoubaoAdapter().getConversationList()
    const byId = new Map(list.map((item) => [item.id, item]))

    expect(byId.get("111")?.isPinned).toBe(true)
    expect(byId.get("222")?.isPinned).toBe(false)
  })

  it("does not mark conversations as pinned when no pinned section exists", () => {
    vi.stubGlobal("window", { location: new URL("https://www.doubao.com/chat/") })
    const recentSection = createSection("最近", [createLink("333", "普通会话")])
    const body = StubElement.el("body").append(StubElement.el("div").append(recentSection))
    installDocument(body)

    const list = new DoubaoAdapter().getConversationList()
    expect(list.find((item) => item.id === "333")?.isPinned).toBe(false)
  })
})
