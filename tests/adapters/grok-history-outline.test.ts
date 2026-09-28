import { describe, expect, it } from "vitest"

import { parseGrokHistoryOutline, parseGrokResponseTree } from "~adapters/grok-history-outline"
import { isApiOutlineStale } from "~utils/outline-api-source"

interface TestNode {
  responseId: string
  sender: "human" | "assistant"
  parentResponseId: string
}

const ROOT_SENTINEL = "00000000-0000-0000-0000-000000000000"
const SESSION_ID = "4fa59d34-6f49-4ab7-a54b-e428c9f7bed3"

const buildTreePayload = (nodes: TestNode[]) => ({ responseNodes: nodes })

const buildLoadPayload = (nodes: TestNode[], messages: Record<string, string>) => ({
  responses: nodes.map((node) => ({
    responseId: node.responseId,
    sender: node.sender,
    message: messages[node.responseId] ?? "",
  })),
})

/** 线性对话：user1 -> asst1 -> user2 -> asst2 */
const linearNodes = (): TestNode[] => [
  { responseId: "u1", sender: "human", parentResponseId: ROOT_SENTINEL },
  { responseId: "a1", sender: "assistant", parentResponseId: "u1" },
  { responseId: "u2", sender: "human", parentResponseId: "a1" },
  { responseId: "a2", sender: "assistant", parentResponseId: "u2" },
]

describe("parseGrokResponseTree", () => {
  it("resolves the single chain ending at the last node", () => {
    const tree = parseGrokResponseTree(buildTreePayload(linearNodes()), SESSION_ID)
    expect(tree).not.toBeNull()
    expect(tree!.sessionId).toBe(SESSION_ID)
    expect(tree!.branchResponseIds).toEqual(["u1", "a1", "u2", "a2"])
    expect(tree!.leafResponseId).toBe("a2")
    expect(tree!.signature).toBe("4:a2")
  })

  it("follows the newest branch when regeneration creates siblings", () => {
    const nodes = [
      ...linearNodes(),
      // u2 的重新生成旁支（创建更晚，排在数组末尾）
      { responseId: "a2-regen", sender: "assistant" as const, parentResponseId: "u2" },
    ]
    const tree = parseGrokResponseTree(buildTreePayload(nodes), SESSION_ID)
    expect(tree).not.toBeNull()
    expect(tree!.branchResponseIds).toEqual(["u1", "a1", "u2", "a2-regen"])
    expect(tree!.leafResponseId).toBe("a2-regen")
  })

  it("prefers the URL rid leaf when it is a childless node (viewing an older branch)", () => {
    const nodes = [
      ...linearNodes(),
      { responseId: "a2-regen", sender: "assistant" as const, parentResponseId: "u2" },
    ]
    const tree = parseGrokResponseTree(buildTreePayload(nodes), SESSION_ID, "a2")
    expect(tree).not.toBeNull()
    expect(tree!.branchResponseIds).toEqual(["u1", "a1", "u2", "a2"])
  })

  it("ignores a mid-branch rid (has children) and falls back to the newest leaf", () => {
    const tree = parseGrokResponseTree(buildTreePayload(linearNodes()), SESSION_ID, "a1")
    expect(tree).not.toBeNull()
    expect(tree!.leafResponseId).toBe("a2")
  })

  it("returns null for malformed payloads", () => {
    expect(parseGrokResponseTree(null, SESSION_ID)).toBeNull()
    expect(parseGrokResponseTree({}, SESSION_ID)).toBeNull()
    expect(parseGrokResponseTree({ responseNodes: [] }, SESSION_ID)).toBeNull()
    expect(parseGrokResponseTree(buildTreePayload(linearNodes()), "")).toBeNull()
  })
})

describe("parseGrokHistoryOutline", () => {
  it("extracts headings and user queries on the active branch", () => {
    const nodes = linearNodes()
    const tree = parseGrokResponseTree(buildTreePayload(nodes), SESSION_ID)!
    const load = buildLoadPayload(nodes, {
      u1: "第一个问题",
      a1: "## 第一节\n正文\n### 小节",
      u2: "第二个问题",
      a2: "没有标题的回复",
    })

    const data = parseGrokHistoryOutline(tree, load)
    expect(data).not.toBeNull()
    expect(data!.sessionId).toBe(SESSION_ID)
    expect(data!.branchMessageIds).toEqual([0, 1, 2, 3])
    expect(data!.maxMessageId).toBe(3)
    expect(data!.queryCount).toBe(2)

    expect(data!.headingsByMessageIndex.get(1)).toEqual([
      { level: 2, text: "第一节", wordCount: 5 },
      { level: 3, text: "小节", wordCount: 0 },
    ])
    expect(data!.headingsByMessageIndex.has(3)).toBe(false)

    expect(data!.userQueries).toEqual([
      { messageIndex: 0, queryIndex: 1, text: "第一个问题" },
      { messageIndex: 2, queryIndex: 2, text: "第二个问题" },
    ])
    expect(data!.positionByResponseId.get("a1")).toBe(1)
    expect(data!.branchResponseIds[3]).toBe("a2")
    // 提问字数口径 = 对应回复的文本长度
    expect(data!.assistantIndexByQueryIndex.get(1)).toBe(1)
    expect(data!.assistantIndexByQueryIndex.get(2)).toBe(3)
    expect(data!.replyWordCountByMessageIndex.get(3)).toBeGreaterThan(0)
  })

  it("filters headings by maxLevel", () => {
    const nodes = linearNodes()
    const tree = parseGrokResponseTree(buildTreePayload(nodes), SESSION_ID)!
    const load = buildLoadPayload(nodes, { a1: "# 一级\n## 二级\n### 三级" })

    const data = parseGrokHistoryOutline(tree, load, 2)
    expect(data!.headingsByMessageIndex.get(1)!.map((heading) => heading.level)).toEqual([1, 2])
  })

  it("keeps queryIndex absolute order for text-less human messages", () => {
    const nodes = linearNodes()
    const tree = parseGrokResponseTree(buildTreePayload(nodes), SESSION_ID)!
    // u1 纯附件提问（message 为空），u2 正常
    const load = buildLoadPayload(nodes, { u2: "第二个问题", a1: "回复一", a2: "回复二" })

    const data = parseGrokHistoryOutline(tree, load)
    expect(data!.queryCount).toBe(2)
    expect(data!.userQueries).toEqual([{ messageIndex: 2, queryIndex: 2, text: "第二个问题" }])
  })

  it("tolerates branch responses missing from load-responses", () => {
    const nodes = linearNodes()
    const tree = parseGrokResponseTree(buildTreePayload(nodes), SESSION_ID)!
    const load = {
      responses: [
        { responseId: "u1", sender: "human", message: "问题" },
        // a1 缺失：跳过标题但不判解析失败
        { responseId: "u2", sender: "human", message: "问题二" },
        { responseId: "a2", sender: "assistant", message: "## 标题" },
      ],
    }

    const data = parseGrokHistoryOutline(tree, load)
    expect(data).not.toBeNull()
    expect(data!.headingsByMessageIndex.has(1)).toBe(false)
    expect(data!.headingsByMessageIndex.get(3)).toEqual([{ level: 2, text: "标题", wordCount: 0 }])
  })

  it("normalizes uppercase senders from load-responses (observed in real payloads)", () => {
    const nodes = linearNodes()
    const tree = parseGrokResponseTree(buildTreePayload(nodes), SESSION_ID)!
    const load = {
      responses: [
        { responseId: "u1", sender: "HUMAN", message: "问题" },
        { responseId: "a1", sender: "ASSISTANT", message: "## 标题" },
        { responseId: "u2", sender: "human", message: "问题二" },
        { responseId: "a2", sender: "assistant", message: "回复二" },
      ],
    }

    const data = parseGrokHistoryOutline(tree, load)
    expect(data).not.toBeNull()
    expect(data!.queryCount).toBe(2)
    expect(data!.userQueries.map((query) => query.queryIndex)).toEqual([1, 2])
    expect(data!.headingsByMessageIndex.get(1)).toEqual([{ level: 2, text: "标题", wordCount: 0 }])
  })

  it("keeps queryIndex absolute order when a human response is missing from load-responses", () => {
    const nodes = linearNodes()
    const tree = parseGrokResponseTree(buildTreePayload(nodes), SESSION_ID)!
    const load = {
      responses: [
        { responseId: "u1", sender: "human", message: "问题" },
        { responseId: "a1", sender: "assistant", message: "回复一" },
        // u2 缺失：骨架 sender 标记它是提问，占住 queryIndex=2，不进大纲序列
        { responseId: "a2", sender: "assistant", message: "## 标题" },
      ],
    }

    const data = parseGrokHistoryOutline(tree, load)
    expect(data).not.toBeNull()
    expect(data!.queryCount).toBe(2)
    expect(data!.userQueries).toEqual([{ messageIndex: 0, queryIndex: 1, text: "问题" }])
    expect(data!.assistantIndexByQueryIndex.get(2)).toBe(3)
    expect(data!.headingsByMessageIndex.get(3)).toEqual([{ level: 2, text: "标题", wordCount: 0 }])
  })

  it("returns null for malformed load payloads", () => {
    const tree = parseGrokResponseTree(buildTreePayload(linearNodes()), SESSION_ID)!
    expect(parseGrokHistoryOutline(tree, null)).toBeNull()
    expect(parseGrokHistoryOutline(tree, { responses: "not-an-array" })).not.toBeNull()
  })
})

describe("grok api outline staleness", () => {
  it("treats mounted rows unknown to the branch as stale (new message)", () => {
    const nodes = linearNodes()
    const tree = parseGrokResponseTree(buildTreePayload(nodes), SESSION_ID)!
    const load = buildLoadPayload(nodes, { u1: "一", u2: "二" })
    const data = parseGrokHistoryOutline(tree, load)!

    // 挂载行全部在分支内：不过期
    expect(
      isApiOutlineStale({
        data,
        sessionId: SESSION_ID,
        mountedIds: new Set([0, 1]),
        atBottom: false,
      }),
    ).toBe(false)
    // 新发送的消息（adapter 映射为 maxMessageId + 1 = 4）：过期
    expect(
      isApiOutlineStale({
        data,
        sessionId: SESSION_ID,
        mountedIds: new Set([0, 4]),
        atBottom: false,
      }),
    ).toBe(true)
    // 会话切换：过期
    expect(
      isApiOutlineStale({ data, sessionId: "other", mountedIds: new Set([0]), atBottom: false }),
    ).toBe(true)
  })
})
