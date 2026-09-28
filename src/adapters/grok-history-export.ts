import {
  countGrokTreeRoots,
  parseGrokResponseTree,
  type GrokLoadResponseItem,
} from "./grok-history-outline"

/** load-responses 中一条响应提取出的导出素材（格式化由适配器负责） */
export interface GrokHistoryExportMessage {
  role: "user" | "assistant"
  /** 用户提问正文（human 的 message，原始 markdown 源文本） */
  requestText: string
  /** 用户附件元数据（fileAttachmentsMetadata 原样透出，适配器复用同一解析器） */
  fileAttachmentsMetadata: Record<string, unknown>[]
  /** 回复 markdown（已剥离 grok:render 渲染标签） */
  responseMarkdown: string
  /** 生成图片的相对 URL（cardAttachmentsJson 图片块按卡片去重、取最终版本） */
  generatedImageUrls: string[]
}

export interface GrokHistoryExportData {
  sessionId: string
  messages: GrokHistoryExportMessage[]
}

const asRecord = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === "object" ? (value as Record<string, unknown>) : null

const asObjectArray = <T>(value: unknown): T[] =>
  Array.isArray(value) ? (value.filter(Boolean) as T[]) : []

/** 生成图片等卡片在 message 里的渲染占位标签（真实内容在 cardAttachmentsJson） */
const GROK_RENDER_TAG_PATTERN = /<grok:render\b(?:[\s\S]*?<\/grok:render>|[^>]*\/>)/g

/**
 * 从 cardAttachmentsJson（JSON 字符串数组，同卡片的渐进块会重复出现）
 * 提取生成图片 URL：按卡片 id 去重、保留最后一次（progress 最终态）。
 */
const extractGeneratedImageUrls = (item: GrokLoadResponseItem): string[] => {
  const urls: string[] = []
  const seen = new Set<string>()

  // 同一张卡片按 id 收敛到最后一次出现的 imageUrl
  const urlByCardId = new Map<string, string>()
  for (const raw of asObjectArray<string>(asRecord(item)?.cardAttachmentsJson)) {
    if (typeof raw !== "string") continue
    let card: Record<string, unknown> | null = null
    try {
      card = asRecord(JSON.parse(raw))
    } catch {
      card = null
    }
    const imageUrl = asRecord(card?.image_chunk)?.imageUrl
    if (typeof imageUrl !== "string" || !imageUrl) continue
    const cardId = typeof card?.id === "string" && card.id ? card.id : imageUrl
    urlByCardId.set(cardId, imageUrl)
  }
  for (const url of urlByCardId.values()) {
    if (seen.has(url)) continue
    seen.add(url)
    urls.push(url)
  }

  // generatedImageUrls 字段（另一种图片透出形式）原样补充
  for (const url of asObjectArray<string>(asRecord(item)?.generatedImageUrls)) {
    if (typeof url !== "string" || !url || seen.has(url)) continue
    seen.add(url)
    urls.push(url)
  }

  return urls
}

/**
 * 解析 response-node + load-responses 为导出消息序列（激活分支、完整历史）。
 * 完整性门槛严于大纲（无法证明历史完整时返回 null，调用方回退 DOM 收集）：
 * - 骨架必须恰有一个根（截断/孤儿节点无法证明完整）；
 * - 分支上每个 responseId 都必须在 load-responses 中取到条目（缺条即缺段）。
 * 其余内容一律提取或跳过，不回退：steps（思考步骤标题）、webSearchResults
 * 等工具过程不参与导出（与 DOM 导出等价）；sender 大小写不敏感（接口实测
 * 存在 "ASSISTANT" 大写形式）。
 */
export function parseGrokHistoryExport(
  treePayload: unknown,
  loadPayload: unknown,
  sessionId: string,
  preferredLeafId?: string | null,
): GrokHistoryExportData | null {
  const tree = parseGrokResponseTree(treePayload, sessionId, preferredLeafId)
  if (!tree) return null
  if (countGrokTreeRoots(treePayload) !== 1) return null

  const root = asRecord(loadPayload)
  if (!root) return null
  const responses = asObjectArray<GrokLoadResponseItem>(root.responses)

  const itemByResponseId = new Map<string, GrokLoadResponseItem>()
  for (const item of responses) {
    if (typeof item?.responseId === "string") {
      itemByResponseId.set(item.responseId, item)
    }
  }
  for (const responseId of tree.branchResponseIds) {
    if (!itemByResponseId.has(responseId)) return null
  }

  const messages: GrokHistoryExportMessage[] = []
  for (const responseId of tree.branchResponseIds) {
    const item = itemByResponseId.get(responseId)!
    const sender = typeof item.sender === "string" ? item.sender.toLowerCase() : ""
    const message = typeof item.message === "string" ? item.message : ""

    if (sender === "human") {
      messages.push({
        role: "user",
        requestText: message.trim(),
        fileAttachmentsMetadata: asObjectArray<Record<string, unknown>>(
          asRecord(item)?.fileAttachmentsMetadata,
        ),
        responseMarkdown: "",
        generatedImageUrls: [],
      })
      continue
    }
    if (sender !== "assistant") continue

    messages.push({
      role: "assistant",
      requestText: "",
      fileAttachmentsMetadata: [],
      responseMarkdown: message.replace(GROK_RENDER_TAG_PATTERN, "").trim(),
      generatedImageUrls: extractGeneratedImageUrls(item),
    })
  }

  if (messages.length === 0) return null
  return { sessionId: tree.sessionId, messages }
}
