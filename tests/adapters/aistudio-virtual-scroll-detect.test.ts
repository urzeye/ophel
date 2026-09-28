import { describe, expect, it, vi } from "vitest"

import { AIStudioAdapter } from "~adapters/aistudio"

// base.ts 在模块顶层实例化 DOMToolkit（依赖 document）；node 环境下打桩
vi.mock("~utils/dom-toolkit", () => ({
  DOMToolkit: {
    query: vi.fn(),
  },
}))

interface AdapterInternals {
  config: unknown
  getScrollbarQueryEntries: () => Array<{ element: unknown }>
  isVirtualScrollConversation: () => boolean
}

const createAdapter = (entries: Array<{ element: unknown }>) => {
  const adapter = Object.create(AIStudioAdapter.prototype) as AdapterInternals
  adapter.config = {
    sitePrivateSelectors: { turn: "ms-chat-turn", mountedContent: "ms-text-chunk" },
  }
  adapter.getScrollbarQueryEntries = () => entries
  return adapter
}

/** hasContent=true 模拟已渲染的 turn，false 模拟无内容空壳 */
const fakeEntry = (hasContent: boolean) => ({
  element: {
    closest: () => ({
      querySelector: (selector: string) => (selector === "ms-text-chunk" && hasContent ? {} : null),
    }),
  },
})

describe("isVirtualScrollConversation", () => {
  it("条目不足两个时不视为虚拟会话", () => {
    expect(createAdapter([fakeEntry(true)]).isVirtualScrollConversation()).toBe(false)
  })

  it("所有提问轮都有真实内容时不视为虚拟会话", () => {
    expect(createAdapter([fakeEntry(true), fakeEntry(true)]).isVirtualScrollConversation()).toBe(
      false,
    )
  })

  it("存在无内容空壳 turn 时视为虚拟会话", () => {
    expect(createAdapter([fakeEntry(true), fakeEntry(false)]).isVirtualScrollConversation()).toBe(
      true,
    )
  })

  it("存在未挂载条目时视为虚拟会话", () => {
    expect(createAdapter([fakeEntry(true), { element: null }]).isVirtualScrollConversation()).toBe(
      true,
    )
  })
})
