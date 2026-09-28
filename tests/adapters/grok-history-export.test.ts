import { describe, expect, it } from "vitest"

import { parseGrokHistoryExport } from "~adapters/grok-history-export"

const ROOT_SENTINEL = "00000000-0000-0000-0000-000000000000"
const SESSION_ID = "4fa59d34-6f49-4ab7-a54b-e428c9f7bed3"

interface TestNode {
  responseId: string
  sender: string
  parentResponseId: string
}

const linearNodes = (): TestNode[] => [
  { responseId: "u1", sender: "human", parentResponseId: ROOT_SENTINEL },
  { responseId: "a1", sender: "assistant", parentResponseId: "u1" },
  { responseId: "u2", sender: "human", parentResponseId: "a1" },
  { responseId: "a2", sender: "assistant", parentResponseId: "u2" },
]

const treePayload = (nodes: TestNode[]) => ({ responseNodes: nodes })

const loadPayload = (
  items: Record<string, { message: string; sender?: string; extra?: Record<string, unknown> }>,
) => ({
  responses: Object.entries(items).map(([responseId, item]) => ({
    responseId,
    sender: item.sender ?? (responseId.startsWith("u") ? "human" : "assistant"),
    message: item.message,
    ...item.extra,
  })),
})

const fullLoad = (overrides?: Parameters<typeof loadPayload>[0]) =>
  loadPayload({
    u1: { message: "第一个问题" },
    a1: { message: "## 答复一\n正文" },
    u2: { message: "第二个问题" },
    a2: { message: "答复二" },
    ...overrides,
  })

describe("parseGrokHistoryExport", () => {
  it("exports the full active branch in order", () => {
    const data = parseGrokHistoryExport(treePayload(linearNodes()), fullLoad(), SESSION_ID)
    expect(data).not.toBeNull()
    expect(data!.sessionId).toBe(SESSION_ID)
    expect(data!.messages.map((message) => message.role)).toEqual([
      "user",
      "assistant",
      "user",
      "assistant",
    ])
    expect(data!.messages[0].requestText).toBe("第一个问题")
    expect(data!.messages[1].responseMarkdown).toContain("## 答复一")
  })

  it("accepts uppercase ASSISTANT sender (observed in real payloads)", () => {
    const data = parseGrokHistoryExport(
      treePayload(linearNodes()),
      fullLoad({ a2: { message: "大写答复", sender: "ASSISTANT" } }),
      SESSION_ID,
    )
    expect(data).not.toBeNull()
    expect(data!.messages[3].role).toBe("assistant")
    expect(data!.messages[3].responseMarkdown).toBe("大写答复")
  })

  it("passes through user attachment metadata", () => {
    const metadata = [
      {
        fileMetadataId: "m1",
        fileMimeType: "image/png",
        fileName: "shot.png",
        fileUri: "users/u1/m1/content",
      },
    ]
    const data = parseGrokHistoryExport(
      treePayload(linearNodes()),
      fullLoad({ u1: { message: "看图", extra: { fileAttachmentsMetadata: metadata } } }),
      SESSION_ID,
    )
    expect(data!.messages[0].fileAttachmentsMetadata).toEqual(metadata)
  })

  it("strips grok:render tags and dedupes progressive image chunks by card id", () => {
    const renderTag =
      '<grok:render card_id="GSg6y" card_type="generated_image_card"><argument name="prompt">p</argument></grok:render>'
    const cardChunks = [
      JSON.stringify({
        id: "GSg6y",
        image_chunk: { imageUrl: "users/u/generated/img-part-0/image.jpg", progress: 50 },
      }),
      JSON.stringify({
        id: "GSg6y",
        image_chunk: { imageUrl: "users/u/generated/img/image.jpg", progress: 100 },
      }),
    ]
    const data = parseGrokHistoryExport(
      treePayload(linearNodes()),
      fullLoad({
        a2: { message: `${renderTag}后续说明`, extra: { cardAttachmentsJson: cardChunks } },
      }),
      SESSION_ID,
    )
    expect(data).not.toBeNull()
    expect(data!.messages[3].responseMarkdown).toBe("后续说明")
    expect(data!.messages[3].generatedImageUrls).toEqual(["users/u/generated/img/image.jpg"])
  })

  it("merges generatedImageUrls field with card chunks, deduped", () => {
    const data = parseGrokHistoryExport(
      treePayload(linearNodes()),
      fullLoad({
        a2: {
          message: "图",
          extra: {
            cardAttachmentsJson: [
              JSON.stringify({ id: "c1", image_chunk: { imageUrl: "users/u/a.jpg" } }),
            ],
            generatedImageUrls: ["users/u/a.jpg", "users/u/b.jpg"],
          },
        },
      }),
      SESSION_ID,
    )
    expect(data!.messages[3].generatedImageUrls).toEqual(["users/u/a.jpg", "users/u/b.jpg"])
  })

  it("returns null when any branch response is missing from load-responses", () => {
    const load = fullLoad()
    load.responses = load.responses.filter((item) => item.responseId !== "a1")
    expect(parseGrokHistoryExport(treePayload(linearNodes()), load, SESSION_ID)).toBeNull()
  })

  it("returns null when the tree has more than one root (truncated history)", () => {
    const nodes = [
      ...linearNodes(),
      // 孤儿节点：parent 不在集合内且不是唯一的根 → 无法证明历史完整
      { responseId: "orphan", sender: "human", parentResponseId: "deleted-parent" },
    ]
    expect(parseGrokHistoryExport(treePayload(nodes), fullLoad(), SESSION_ID)).toBeNull()
  })

  it("exports the branch selected by the URL rid leaf", () => {
    const nodes = [
      ...linearNodes(),
      { responseId: "a2-regen", sender: "assistant", parentResponseId: "u2" },
    ]
    const load = fullLoad({ "a2-regen": { message: "重新生成的答复" } })
    const data = parseGrokHistoryExport(treePayload(nodes), load, SESSION_ID, "a2-regen")
    expect(data).not.toBeNull()
    expect(data!.messages.map((message) => message.role)).toEqual([
      "user",
      "assistant",
      "user",
      "assistant",
    ])
    expect(data!.messages[3].responseMarkdown).toBe("重新生成的答复")
  })

  it("returns null for malformed payloads", () => {
    expect(parseGrokHistoryExport(null, fullLoad(), SESSION_ID)).toBeNull()
    expect(parseGrokHistoryExport(treePayload(linearNodes()), null, SESSION_ID)).toBeNull()
    expect(parseGrokHistoryExport(treePayload([]), fullLoad(), SESSION_ID)).toBeNull()
  })
})
