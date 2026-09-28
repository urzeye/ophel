import { describe, expect, it, vi } from "vitest"

import { AIStudioAdapter } from "~adapters/aistudio"

// base.ts 在模块顶层实例化 DOMToolkit（依赖 document）；node 环境下打桩
vi.mock("~utils/dom-toolkit", () => ({
  DOMToolkit: {
    query: vi.fn(),
  },
}))

const TURN_DOC_TOP = 5000
const OFFSET = 120

interface AdapterInternals {
  config: unknown
  getScrollbarQueryEntries: () => unknown[]
  getScrollContainer: () => unknown
  findUserQueryElementByTurnId: () => unknown
  waitForUserQueryElementByTurnId: () => Promise<unknown>
  revealUserQueryThroughScrollbar: () => boolean
  restoreVirtualAnchor: (anchor: {
    type: string
    rowKey: number
    offset?: number
    textSignature?: string
  }) => Promise<boolean>
}

describe("restoreVirtualAnchor", () => {
  it("开场滚动安静后 reveal 目标轮，并按视觉位置对齐到保存的偏移", async () => {
    const container = {
      scrollTop: 0,
      scrollHeight: 20000,
      clientHeight: 800,
      getBoundingClientRect: () => ({ top: 0 }),
      dispatchEvent: () => true,
    }
    const turn = {
      getBoundingClientRect: () => ({ top: TURN_DOC_TOP - container.scrollTop }),
    }
    const userElement = { closest: () => turn }
    const entries = [0, 1, 2, 3].map((index) => ({
      turnId: `T${index}`,
      text: "问题",
      element: userElement,
      index,
    }))

    const adapter = Object.create(AIStudioAdapter.prototype) as AdapterInternals
    adapter.config = { sitePrivateSelectors: { turn: "ms-chat-turn" } }
    adapter.getScrollbarQueryEntries = () => entries
    adapter.getScrollContainer = () => container
    adapter.findUserQueryElementByTurnId = () => userElement
    adapter.waitForUserQueryElementByTurnId = async () => userElement
    // 模拟站点滚动条跳转：把目标轮顶到视口顶部
    adapter.revealUserQueryThroughScrollbar = () => {
      container.scrollTop = TURN_DOC_TOP
      return true
    }

    const restored = await adapter.restoreVirtualAnchor({
      type: "virtual-row",
      rowKey: 3,
      offset: OFFSET,
      textSignature: "问题",
    })

    expect(restored).toBe(true)
    expect(container.scrollTop).toBe(TURN_DOC_TOP + OFFSET)
  }, 15000)
})
