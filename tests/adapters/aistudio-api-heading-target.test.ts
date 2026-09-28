import { beforeEach, describe, expect, it, vi } from "vitest"

import { AIStudioAdapter } from "~adapters/aistudio"

// base.ts 在模块顶层实例化 DOMToolkit（依赖 document）；node 环境下打桩
vi.mock("~utils/dom-toolkit", () => ({
  DOMToolkit: {
    query: vi.fn(),
  },
}))

class FakeHTMLElement {}

interface AdapterInternals {
  config: unknown
  apiOutlineData: unknown
  getSessionId: () => string
  getScrollbarQueryEntries: () => unknown[]
  mapScrollbarEntriesToApiQueries: () => Map<string, number>
  findUserQueryElementByTurnId: () => unknown
  waitForUserQueryElementByTurnId: () => Promise<unknown>
  revealUserQueryThroughScrollbar: () => void
  findMountedHeadingAfterUserQuery: () => unknown
  turnHasMountedContent: () => boolean
  waitForTurnContentMounted: () => Promise<boolean>
  resolveApiOutlineHeadingTarget: (item: { id?: string; text: string }) => Promise<unknown>
}

const createAdapter = () => {
  const adapter = Object.create(AIStudioAdapter.prototype) as AdapterInternals
  adapter.config = {
    sitePrivateSelectors: { turn: "ms-chat-turn" },
    selectors: { userQuery: ".chat-turn-container.user" },
  }
  adapter.apiOutlineData = {
    sessionId: "s1",
    headingsByQueryIndex: new Map([[1, [{ level: 1, text: "H", wordCount: 0 }]]]),
  }
  adapter.getSessionId = () => "s1"
  const entry = { turnId: "T1", text: "Q", element: {}, index: 0 }
  adapter.getScrollbarQueryEntries = () => [entry]
  adapter.mapScrollbarEntriesToApiQueries = () => new Map([["T1", 1]])
  adapter.revealUserQueryThroughScrollbar = vi.fn()
  return adapter
}

describe("resolveApiOutlineHeadingTarget", () => {
  beforeEach(() => {
    vi.stubGlobal("HTMLElement", FakeHTMLElement)
  })

  it("回答空壳渲染完成后返回答复标题而非提问元素", async () => {
    const adapter = createAdapter()
    const headingEl = { tag: "h2" }
    const userElement = { closest: () => userTurn }
    const siblingTurn = Object.assign(new FakeHTMLElement(), {
      querySelector: () => null,
      nextElementSibling: null,
    })
    const userTurn = { nextElementSibling: siblingTurn }

    adapter.findUserQueryElementByTurnId = () => userElement
    adapter.waitForUserQueryElementByTurnId = async () => userElement

    let mounted = false
    let findCalls = 0
    adapter.findMountedHeadingAfterUserQuery = () => {
      findCalls += 1
      return mounted ? headingEl : null
    }
    adapter.turnHasMountedContent = () => mounted
    const waitSpy = vi.fn(async () => {
      mounted = true
      return true
    })
    adapter.waitForTurnContentMounted = waitSpy

    const target = await adapter.resolveApiOutlineHeadingTarget({
      id: "aistudio-api:q1:h0",
      text: "H",
    })

    expect(target).toBe(headingEl)
    expect(waitSpy).toHaveBeenCalledTimes(1)
    expect(findCalls).toBe(2)
  })

  it("回答内容始终不挂载时回落到提问元素", async () => {
    const adapter = createAdapter()
    const userElement = { closest: () => userTurn }
    const siblingTurn = Object.assign(new FakeHTMLElement(), {
      querySelector: () => null,
      nextElementSibling: null,
    })
    const userTurn = { nextElementSibling: siblingTurn }

    adapter.findUserQueryElementByTurnId = () => userElement
    adapter.waitForUserQueryElementByTurnId = async () => userElement
    adapter.findMountedHeadingAfterUserQuery = () => null
    adapter.turnHasMountedContent = () => false
    adapter.waitForTurnContentMounted = async () => false

    const target = await adapter.resolveApiOutlineHeadingTarget({
      id: "aistudio-api:q1:h0",
      text: "H",
    })

    expect(target).toBe(userElement)
  })
})
