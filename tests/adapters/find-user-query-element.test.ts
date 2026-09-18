import { afterEach, describe, expect, it, vi } from "vitest"

// DOMToolkit 在模块加载时读取全局 document；node 环境提供最小 stub
vi.hoisted(() => {
  const globalRef = globalThis as Record<string, unknown>
  globalRef.document ??= { documentElement: {}, body: {} }
})

import { SiteAdapter } from "~adapters/base"
import { DOMToolkit } from "~utils/dom-toolkit"

class TestAdapter extends SiteAdapter {
  private texts = new Map<Element, string>()

  match(): boolean {
    return true
  }
  getSiteId(): string {
    return "test"
  }
  getName(): string {
    return "Test"
  }
  getThemeColors(): { primary: string; secondary: string } {
    return { primary: "#000000", secondary: "#ffffff" }
  }
  getTextareaSelectors(): string[] {
    return []
  }
  insertPrompt(): boolean {
    return false
  }
  getConversationTitle(): string | null {
    return null
  }

  override getUserQuerySelector(): string {
    return ".user-query"
  }

  registerElement(text: string): Element {
    const element = {} as Element
    this.texts.set(element, text)
    return element
  }

  override extractUserQueryText(element: Element): string {
    return this.texts.get(element) ?? ""
  }
}

const mockMountedQueries = (elements: Element[]): void => {
  vi.spyOn(DOMToolkit, "query").mockReturnValue(elements)
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe("SiteAdapter.findUserQueryElement", () => {
  it("matches the indexed query by exact text", () => {
    const adapter = new TestAdapter()
    const first = adapter.registerElement("first question")
    const second = adapter.registerElement("second question")
    mockMountedQueries([first, second])

    expect(adapter.findUserQueryElement(2, "second question")).toBe(second)
  })

  it("matches a truncated outline text against the full query text", () => {
    const adapter = new TestAdapter()
    const long = adapter.registerElement("a very long question body that keeps going")
    mockMountedQueries([long])

    expect(adapter.findUserQueryElement(1, "a very long question")).toBe(long)
  })

  // 回归：纯图片提问的 DOM 文本为空，startsWith("") 恒真曾把任何搜索都匹配到它身上
  it("never matches an empty-text query when searching by a non-empty text", () => {
    const adapter = new TestAdapter()
    const imageOnly = adapter.registerElement("")
    const mounted = adapter.registerElement("some mounted question")
    mockMountedQueries([imageOnly, mounted])

    expect(adapter.findUserQueryElement(5, "unrelated truncated label")).toBeNull()
  })

  it("falls back to index when the outline text is empty", () => {
    const adapter = new TestAdapter()
    const imageOnly = adapter.registerElement("")
    mockMountedQueries([imageOnly])

    expect(adapter.findUserQueryElement(1, "")).toBe(imageOnly)
  })

  it("returns null for an empty text when the index is out of range", () => {
    const adapter = new TestAdapter()
    const mounted = adapter.registerElement("some mounted question")
    mockMountedQueries([mounted])

    expect(adapter.findUserQueryElement(3, "")).toBeNull()
  })
})
