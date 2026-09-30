import { describe, expect, it, vi } from "vitest"

import type { OutlineItem } from "~adapters/base"
import { DeepSeekAdapter } from "~adapters/deepseek"
import {
  parseDeepSeekHistoryOutline,
  type DeepSeekHistoryOutlineData,
} from "~adapters/deepseek-history-outline"

// base.ts 在模块顶层实例化 DOMToolkit（依赖 document）；node 环境下打桩
vi.mock("~utils/dom-toolkit", () => ({
  DOMToolkit: {
    query: vi.fn(),
  },
}))

type MergeOptions = { maxLevel: number; includeUserQueries: boolean; showWordCount: boolean }

type AdapterInternals = {
  mergeOutlineByBranchOrder: (
    domItems: OutlineItem[],
    data: DeepSeekHistoryOutlineData,
    container: Element,
    domQueryFullTexts: Map<OutlineItem, string>,
    options: MergeOptions,
  ) => OutlineItem[]
}

const fakeRow = (id: number) => ({ getAttribute: () => String(id) })

const fakeContainer = (mountedIds: number[]) =>
  ({ querySelectorAll: () => mountedIds.map(fakeRow) }) as unknown as Element

const fakeElementInRow = (id: number) => ({ closest: () => fakeRow(id) }) as unknown as Element

// 新消息尚未进入虚拟列表（或挂着非数字临时 key）：归属不到任何行
const fakeUnkeyedElement = () => ({ closest: () => null }) as unknown as Element

const buildData = (
  messages: {
    message_id: number
    parent_id: number | null
    role: "USER" | "ASSISTANT"
    fragments: { type: string; content?: string; files?: { file_name?: string }[] }[]
  }[],
): DeepSeekHistoryOutlineData =>
  parseDeepSeekHistoryOutline({
    code: 0,
    data: {
      biz_code: 0,
      biz_data: {
        chat_session: {
          id: "session-1",
          version: messages.length,
          current_message_id: messages[messages.length - 1]?.message_id,
        },
        chat_messages: messages,
      },
    },
  })!

const userMessage = (id: number, parentId: number | null, text: string) => ({
  message_id: id,
  parent_id: parentId,
  role: "USER" as const,
  fragments: [{ type: "REQUEST", content: text }],
})

const assistantMessage = (id: number, parentId: number, markdown: string) => ({
  message_id: id,
  parent_id: parentId,
  role: "ASSISTANT" as const,
  fragments: [{ type: "RESPONSE", content: markdown }],
})

const baseData = () =>
  buildData([
    userMessage(1, null, "问题一"),
    assistantMessage(2, 1, "## 标题A\n正文"),
    userMessage(3, 2, "问题二"),
    assistantMessage(4, 3, "## 标题B\n正文"),
  ])

const headingItem = (messageId: number, text: string): OutlineItem => ({
  level: 2,
  text,
  element: fakeElementInRow(messageId),
})

const queryItem = (messageId: number, text: string): OutlineItem => ({
  level: 0,
  text,
  element: fakeElementInRow(messageId),
  isUserQuery: true,
})

const merge = (
  adapter: DeepSeekAdapter,
  domItems: OutlineItem[],
  data: DeepSeekHistoryOutlineData,
  mountedIds: number[],
  domQueryFullTexts: Map<OutlineItem, string>,
  options?: Partial<MergeOptions>,
) =>
  (adapter as unknown as AdapterInternals).mergeOutlineByBranchOrder(
    domItems,
    data,
    fakeContainer(mountedIds),
    domQueryFullTexts,
    { maxLevel: 6, includeUserQueries: true, showWordCount: true, ...options },
  )

describe("DeepSeekAdapter.mergeOutlineByBranchOrder", () => {
  it("fills unmounted queries and headings by branch order and keeps mounted dom items", () => {
    const adapter = new DeepSeekAdapter()
    const domQuery = queryItem(3, "问题二")
    const domItems = [headingItem(2, "标题A"), domQuery]

    const merged = merge(adapter, domItems, baseData(), [2, 3], new Map([[domQuery, "问题二"]]))

    expect(merged.map((item) => item.text)).toEqual(["问题一", "标题A", "问题二", "标题B"])

    const [fillQuery, domHeading, mountedQuery, fillHeading] = merged
    // 未挂载提问：接口文本 + 定位 navigationId + 对应回复的估算字数
    expect(fillQuery.isUserQuery).toBe(true)
    expect(fillQuery.element).toBeNull()
    expect(fillQuery.navigationId).toBe("deepseek:api-u:1")
    expect(fillQuery.wordCount).toBe("## 标题A 正文".length)
    expect(fillQuery.id).toBe("deepseek-user-query::0::问题一")
    // 挂载项以 DOM 为准：元素在手、无接口 id
    expect(domHeading.element).not.toBeNull()
    expect(domHeading.id).toBeUndefined()
    expect(mountedQuery.element).not.toBeNull()
    expect(mountedQuery.id).toBe("deepseek-user-query::0::问题二")
    // 未挂载标题：接口回填 id/navigationId + 估算字数
    expect(fillHeading.element).toBeNull()
    expect(fillHeading.id).toMatch(/^deepseek:api-h:4:2:0:[0-9a-f]+$/)
    expect(fillHeading.navigationId).toBe(fillHeading.id)
    expect(fillHeading.wordCount).toBe(2)
  })

  it("keeps generating messages (unknown ids) visible at the tail", () => {
    const adapter = new DeepSeekAdapter()
    const domQuery = queryItem(3, "问题二")
    const newQuery = queryItem(99, "新问题")
    const domItems = [domQuery, headingItem(4, "标题B"), newQuery, headingItem(100, "流式标题")]

    const merged = merge(
      adapter,
      domItems,
      baseData(),
      [3, 4, 99, 100],
      new Map([
        [domQuery, "问题二"],
        [newQuery, "新问题"],
      ]),
    )

    expect(merged.map((item) => item.text)).toEqual([
      "问题一",
      "标题A",
      "问题二",
      "标题B",
      "新问题",
      "流式标题",
    ])
  })

  it("fills image-only queries even when their row is mounted (DOM scan yields no text)", () => {
    const adapter = new DeepSeekAdapter()
    const data = buildData([
      {
        message_id: 1,
        parent_id: null,
        role: "USER",
        fragments: [{ type: "FILE", files: [{ file_name: "image.png" }] }],
      },
      assistantMessage(2, 1, "## 标题A\n正文"),
      userMessage(3, 2, "问题二"),
      assistantMessage(4, 3, "## 标题B\n正文"),
    ])
    // 纯图片提问的行挂载着，但 DOM 扫描提不出文本、没有 DOM 条目
    const domQuery = queryItem(3, "问题二")
    const domItems = [domQuery, headingItem(4, "标题B")]

    const merged = merge(adapter, domItems, data, [1, 3, 4], new Map([[domQuery, "问题二"]]))

    expect(merged.map((item) => item.text)).toEqual(["image.png", "标题A", "问题二", "标题B"])
    const fillQuery = merged[0]
    expect(fillQuery.isUserQuery).toBe(true)
    expect(fillQuery.element).toBeNull()
    expect(fillQuery.navigationId).toBe("deepseek:api-u:1")
    expect(fillQuery.id).toBe("deepseek-user-query::0::image.png")
  })

  it("counts query id occurrences on the full merged sequence", () => {
    const adapter = new DeepSeekAdapter()
    const data = buildData([
      userMessage(1, null, "你好"),
      assistantMessage(2, 1, "无标题"),
      userMessage(3, 2, "你好"),
      assistantMessage(4, 3, "无标题"),
    ])
    const domQuery = queryItem(3, "你好")

    const merged = merge(adapter, [domQuery], data, [3, 4], new Map([[domQuery, "你好"]]))

    // 若只在挂载子集上计数，挂载的第二次"你好"会错误得到 occurrence 0
    expect(merged[0].id).toBe("deepseek-user-query::0::你好")
    expect(merged[1].id).toBe("deepseek-user-query::1::你好")
  })

  it("truncates long fill query text for display but signs with the full text", () => {
    const adapter = new DeepSeekAdapter()
    const longText = "很长的提问".repeat(30)
    const data = buildData([userMessage(1, null, longText), assistantMessage(2, 1, "无标题")])

    const merged = merge(adapter, [], data, [2], new Map())

    expect(merged).toHaveLength(1)
    expect(merged[0].isTruncated).toBe(true)
    expect(merged[0].text.length).toBe(83)
    expect(merged[0].id).toBe(`deepseek-user-query::0::${longText}`)
  })

  it("omits fill word counts when showWordCount is off", () => {
    const adapter = new DeepSeekAdapter()

    const merged = merge(adapter, [], baseData(), [], new Map(), { showWordCount: false })

    expect(merged.every((item) => item.wordCount === undefined)).toBe(true)
  })

  it("dedupes api fill against an unkeyed dom row of the same new message", () => {
    // 回归：新提问挂着临时行 key（归属不到分支），接口重拉后回填同名条目，
    // 不去重会在大纲底部出现两个一样的提问
    const adapter = new DeepSeekAdapter()
    const domQuery = queryItem(0, "问题二")
    ;(domQuery as { element: Element }).element = fakeUnkeyedElement()

    const merged = merge(adapter, [domQuery], baseData(), [], new Map([[domQuery, "问题二"]]))

    // 回填重复项被丢弃，只保留 DOM 条目（元素在手、可定位），且排在尾部
    expect(merged.map((item) => item.text)).toEqual(["问题一", "标题A", "标题B", "问题二"])
    const query = merged.find((item) => item.text === "问题二")
    expect(query?.element).not.toBeNull()
  })

  it("keeps the older unmounted occurrence when the same question was asked twice", () => {
    // 同一提问问了两次：旧的未挂载（接口回填）、新的挂临时 key（DOM）。
    // 计数式去重只丢尾部那条回填，两条都必须在
    const adapter = new DeepSeekAdapter()
    const data = buildData([
      userMessage(1, null, "重复问题"),
      assistantMessage(2, 1, "无标题"),
      userMessage(3, 2, "重复问题"),
      assistantMessage(4, 3, "无标题"),
    ])
    const domQuery = queryItem(0, "重复问题")
    ;(domQuery as { element: Element }).element = fakeUnkeyedElement()

    const merged = merge(adapter, [domQuery], data, [2, 4], new Map([[domQuery, "重复问题"]]))

    expect(merged.map((item) => item.text)).toEqual(["重复问题", "重复问题"])
    expect(merged[0].element).toBeNull()
    expect(merged[1].element).not.toBeNull()
  })

  it("dedupes fill headings against unkeyed dom headings of the streaming reply", () => {
    const adapter = new DeepSeekAdapter()
    const domHeading = headingItem(0, "标题B")
    ;(domHeading as { element: Element }).element = fakeUnkeyedElement()

    const merged = merge(adapter, [domHeading], baseData(), [2], new Map())

    expect(merged.map((item) => item.text)).toEqual(["问题一", "问题二", "标题B"])
    expect(merged.filter((item) => item.text === "标题B")).toHaveLength(1)
  })
})
