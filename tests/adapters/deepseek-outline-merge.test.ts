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

  it("maps negative temp keys of session-sent user rows back to real ids by position", () => {
    // 回归：不刷新页面连发消息时，DeepSeek 给本会话新发的提问行挂负数临时 key
    // （-2、-4…，永不回改）。点击跳转后目标提问行成为挂载窗口第一行，
    // 负数 id 归属不到分支会被当成删除残留，key 取 lastKnownKey+0.01 = -0.99，
    // 把该提问顶到大纲最前。映射回真实 id 后顺序恢复正常。
    const adapter = new DeepSeekAdapter()
    const data = buildData([
      userMessage(1, null, "问题一"),
      assistantMessage(2, 1, "## 标题A\n正文"),
      userMessage(3, 2, "问题二"),
      assistantMessage(4, 3, "## 标题B\n正文"),
      userMessage(5, 4, "问题三"),
      assistantMessage(6, 5, "## 标题C\n正文"),
    ])
    // 窗口挂在对话中部：提问行是负数临时 key，回复行是真实 id
    const domQuery2 = queryItem(-4, "问题二")
    const domQuery3 = queryItem(-6, "问题三")
    const domItems = [domQuery2, headingItem(4, "标题B"), domQuery3, headingItem(6, "标题C")]

    const merged = merge(adapter, domItems, data, [-4, 4, -6, 6], new Map())

    expect(merged.map((item) => item.text)).toEqual([
      "问题一",
      "标题A",
      "问题二",
      "标题B",
      "问题三",
      "标题C",
    ])
    // 映射成功的提问以 DOM 条目为准（元素在手），且占用真实分支位置：
    // 完整序列上的 occurrence 计数正确（第二个提问 occurrence 为 0 系各自文本独立）
    const query2 = merged.find((item) => item.text === "问题二")
    expect(query2?.element).not.toBeNull()
    expect(query2?.id).toBe("deepseek-user-query::0::问题二")
  })

  it("leaves temp keys unmapped when neighbor candidates conflict", () => {
    // prev/next 行映射候选不一致（id 空洞等异常）：保守不映射，
    // 不能把提问错挂到别的 message_id 上导致接口回填被误去重
    const adapter = new DeepSeekAdapter()
    const data = buildData([
      userMessage(1, null, "问题一"),
      assistantMessage(2, 1, "无标题"),
      userMessage(3, 2, "问题二"),
      assistantMessage(4, 3, "无标题"),
      userMessage(5, 4, "问题三"),
      assistantMessage(6, 5, "无标题"),
    ])
    // -4 的上一行真实 id 是 2（候选 3）、下一行真实 id 是 6（候选 5）：冲突
    const domQuery = queryItem(-4, "问题X")

    const merged = merge(adapter, [domQuery], data, [2, -4, 6], new Map([[domQuery, "问题X"]]))

    // 三条提问的接口回填都还在（未被错误的 domQueryMessageIds 抑制）
    expect(merged.map((item) => item.text)).toContain("问题一")
    expect(merged.map((item) => item.text)).toContain("问题二")
    expect(merged.map((item) => item.text)).toContain("问题三")
    expect(merged.map((item) => item.text)).toContain("问题X")
  })
})
