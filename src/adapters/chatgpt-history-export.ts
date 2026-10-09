/**
 * ChatGPT conversations 接口（backend-api/conversations/{id}）导出解析。
 *
 * 新版 DOM 是服务端懒加载 + 虚拟窗口，纯 DOM 滚动收集需要逐屏挂载历史；
 * 接口直出 markdown 源文本（公式/代码零损耗），沿 page_info.start_cursor
 * 向前翻页即可拿全量，无需滚动。
 */

export interface ChatGPTHistoryExportMessage {
  role: "user" | "assistant"
  /** user 提问原文 / assistant 回复 markdown 源文本 */
  text: string
  /** 用户上传的附件（metadata.attachments），图片也在其中（mimeType 区分） */
  attachments: ChatGPTHistoryAttachment[]
  /** 非文本 parts 中的图片指针（file-service:// / sediment://） */
  imageAssetPointers: ChatGPTHistoryImagePointer[]
}

export interface ChatGPTHistoryAttachment {
  id: string
  name: string
  mimeType: string
}

export interface ChatGPTHistoryImagePointer {
  /** asset_pointer 原文（sediment://file_... / file-service://file-...） */
  pointer: string
  mimeType: string
  /** 生成图的标题（tool 消息 metadata.image_gen_title），作图片 alt */
  alt: string
}

export interface ChatGPTHistoryExportData {
  sessionId: string
  messages: ChatGPTHistoryExportMessage[]
}

interface ChatGPTHistoryNormalizedMessage {
  id: string
  role: string
  contentType: string
  /** content.parts 中字符串元素拼接（非字符串元素不提取） */
  text: string
  turnExchangeId: string
  attachments: ChatGPTHistoryAttachment[]
  imageAssetPointers: ChatGPTHistoryImagePointer[]
  /** 生成图标题（tool 消息的 metadata.image_gen_title） */
  imageGenTitle: string
}

interface ChatGPTHistoryPage {
  sessionId: string
  currentNode: string | null
  pageInfo: {
    startCursor: string
    endCursor: string
    hasPreviousPage: boolean
    hasNextPage: boolean
  }
  messages: ChatGPTHistoryNormalizedMessage[]
}

const asRecord = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === "object" ? (value as Record<string, unknown>) : null

const joinTextParts = (content: Record<string, unknown> | null): string => {
  const parts = content?.parts
  if (!Array.isArray(parts)) return ""
  return parts.filter((part): part is string => typeof part === "string").join("\n\n")
}

/** 提取非文本 parts 中的图片指针（multimodal_text 的 image_asset_pointer）。 */
const collectImageAssetPointers = (
  content: Record<string, unknown> | null,
): ChatGPTHistoryImagePointer[] => {
  const parts = content?.parts
  if (!Array.isArray(parts)) return []
  const pointers: ChatGPTHistoryImagePointer[] = []
  for (const part of parts) {
    const record = asRecord(part)
    if (!record) continue
    if (record.content_type !== "image_asset_pointer") continue
    const pointer = record.asset_pointer
    if (typeof pointer !== "string" || !pointer) continue
    pointers.push({
      pointer,
      mimeType: typeof record.mime_type === "string" ? record.mime_type : "",
      alt: "",
    })
  }
  return pointers
}

/** 提取 metadata.attachments（用户上传的文件/图片）。 */
const collectAttachments = (
  metadata: Record<string, unknown> | null,
): ChatGPTHistoryAttachment[] => {
  const raw = metadata?.attachments
  if (!Array.isArray(raw)) return []
  const attachments: ChatGPTHistoryAttachment[] = []
  for (const item of raw) {
    const record = asRecord(item)
    if (!record) continue
    const id = typeof record.id === "string" ? record.id : ""
    if (!id) continue
    attachments.push({
      id,
      name: typeof record.name === "string" ? record.name : "",
      mimeType: typeof record.mime_type === "string" ? record.mime_type : "",
    })
  }
  return attachments
}

/**
 * 解析 conversations 分页响应为规范化消息序列；结构不符预期返回 null
 * （调用方回退滚动收集）。硬校验（均为实测事实）：
 * - page_info.start_cursor = 首条消息 id、end_cursor = 末条消息 id；
 * - 每条消息都有 id；metadata.turn_exchange_id 仅新版响应携带（turn 分组依据），
 *   老版响应缺失时由导出解析改按 user 消息边界分组。
 * thoughts / reasoning_recap / tool 消息原样保留，由导出解析按 role/contentType 过滤。
 */
export function parseChatGPTHistoryPage(payload: unknown): ChatGPTHistoryPage | null {
  const root = asRecord(payload)
  if (!root) return null
  const sessionId = typeof root.conversation_id === "string" ? root.conversation_id : ""
  if (!sessionId) return null

  const pageInfoRaw = asRecord(root.page_info)
  const startCursor = pageInfoRaw?.start_cursor
  const endCursor = pageInfoRaw?.end_cursor
  const hasPreviousPage = pageInfoRaw?.has_previous_page
  const hasNextPage = pageInfoRaw?.has_next_page
  if (
    typeof startCursor !== "string" ||
    !startCursor ||
    typeof endCursor !== "string" ||
    !endCursor ||
    typeof hasPreviousPage !== "boolean" ||
    typeof hasNextPage !== "boolean"
  ) {
    return null
  }

  const rawMessages = Array.isArray(root.messages) ? root.messages : []
  if (rawMessages.length === 0) return null

  const messages: ChatGPTHistoryNormalizedMessage[] = []
  for (const raw of rawMessages) {
    const record = asRecord(raw)
    if (!record) return null
    const id = typeof record.id === "string" ? record.id : ""
    const role = (() => {
      const author = asRecord(record.author)
      return typeof author?.role === "string" ? author.role : ""
    })()
    const content = asRecord(record.content)
    const contentType = typeof content?.content_type === "string" ? content.content_type : ""
    const metadata = asRecord(record.metadata)
    const turnExchangeId =
      typeof metadata?.turn_exchange_id === "string" ? metadata.turn_exchange_id : ""
    if (!id) return null
    messages.push({
      id,
      role,
      contentType,
      text: joinTextParts(content),
      turnExchangeId,
      attachments: collectAttachments(metadata),
      imageAssetPointers: collectImageAssetPointers(content),
      imageGenTitle: typeof metadata?.image_gen_title === "string" ? metadata.image_gen_title : "",
    })
  }

  if (messages[0].id !== startCursor || messages[messages.length - 1].id !== endCursor) {
    return null
  }

  const currentNode =
    typeof root.current_node === "string" && root.current_node ? root.current_node : null

  return {
    sessionId,
    currentNode,
    pageInfo: { startCursor, endCursor, hasPreviousPage, hasNextPage },
    messages,
  }
}

/**
 * 解析 conversations 全部分页为导出消息序列（时间升序）。
 * 完整性门槛，任一不满足返回 null（调用方回退滚动收集）：
 * - 每页都通过结构硬校验且 sessionId 一致；
 * - 首页 current_node 存在；
 * - 末页 has_previous_page === false（已到达历史起点）；
 * - 分页间消息 id 无重叠（翻页游标失效会拉回重复页，据此识别游标链断裂）；
 * - 每个 turn 都有 user 消息（assistant 允许缺失：生成中断场景）。
 * thoughts / reasoning_recap / tool 消息不参与导出（与 DOM 导出口径一致）。
 */
export function parseChatGPTHistoryExport(pages: unknown[]): ChatGPTHistoryExportData | null {
  if (!Array.isArray(pages) || pages.length === 0) return null

  const validPages: ChatGPTHistoryPage[] = []
  for (const payload of pages) {
    const page = parseChatGPTHistoryPage(payload)
    if (!page) return null
    validPages.push(page)
  }

  const sessionId = validPages[0].sessionId
  if (validPages.some((page) => page.sessionId !== sessionId)) return null
  if (!validPages[0].currentNode) return null
  if (validPages[validPages.length - 1].pageInfo.hasPreviousPage !== false) return null

  const seenIds = new Set<string>()
  for (const page of validPages) {
    for (const message of page.messages) {
      if (seenIds.has(message.id)) return null
      seenIds.add(message.id)
    }
  }

  // pages 按抓取顺序排列（首页 = 最新一页）；全局顺序 = 反向拼接分页、页内保持原序
  const allMessages = validPages
    .slice()
    .reverse()
    .flatMap((page) => page.messages)

  type TurnGroup = {
    userMessage: ChatGPTHistoryNormalizedMessage | null
    assistantMessage: ChatGPTHistoryNormalizedMessage | null
    /** 生成图挂在 tool 消息上（图像生成工具结果），assistant 正文可能完全为空 */
    generatedImages: ChatGPTHistoryImagePointer[]
  }

  const applyToTurn = (turn: TurnGroup, message: ChatGPTHistoryNormalizedMessage): void => {
    // 同 turn 可能有多条 assistant/text（工具调用后追答），导出口径取末条；
    // multimodal_text 同样承载正文（生成图片场景）
    if (
      message.role === "assistant" &&
      (message.contentType === "text" || message.contentType === "multimodal_text")
    ) {
      turn.assistantMessage = message
    }
    if (message.role === "tool" && message.imageAssetPointers.length > 0) {
      turn.generatedImages.push(
        ...message.imageAssetPointers.map((pointer) => ({
          ...pointer,
          alt: pointer.alt || message.imageGenTitle,
        })),
      )
    }
  }

  // turn 分组：新版响应每条消息带 metadata.turn_exchange_id，按 id 首次出现
  // 顺序分组；老版响应没有该字段，改按消息序边界分组——system 消息跳过
  // （系统提示，不参与导出），user 消息开启新 turn，assistant/tool 归入当前
  // turn。老版结构里 user 之前出现其它角色说明结构不符预期，返回 null 回退
  // 滚动收集。
  const useExchangeIds = allMessages.every((message) => message.turnExchangeId)
  const turns: TurnGroup[] = []
  if (useExchangeIds) {
    const byExchangeId = new Map<string, TurnGroup>()
    for (const message of allMessages) {
      let turn = byExchangeId.get(message.turnExchangeId)
      if (!turn) {
        turn = { userMessage: null, assistantMessage: null, generatedImages: [] }
        byExchangeId.set(message.turnExchangeId, turn)
        turns.push(turn)
      }
      if (message.role === "user" && !turn.userMessage) {
        turn.userMessage = message
      }
      applyToTurn(turn, message)
    }
  } else {
    let current: TurnGroup | null = null
    for (const message of allMessages) {
      if (message.role === "system") continue
      if (message.role === "user") {
        current = { userMessage: message, assistantMessage: null, generatedImages: [] }
        turns.push(current)
        continue
      }
      if (!current) return null
      applyToTurn(current, message)
    }
  }

  const messages: ChatGPTHistoryExportMessage[] = []
  for (const turn of turns) {
    if (!turn.userMessage) return null
    const user = turn.userMessage
    const userText = user.text.trim()
    // 纯附件提问（无文本）也要导出附件
    if (userText || user.attachments.length > 0 || user.imageAssetPointers.length > 0) {
      messages.push({
        role: "user",
        text: userText,
        attachments: user.attachments,
        imageAssetPointers: user.imageAssetPointers,
      })
    }
    const assistant = turn.assistantMessage
    const assistantText = assistant?.text.trim() ?? ""
    const assistantImages = [...(assistant?.imageAssetPointers ?? []), ...turn.generatedImages]
    const assistantAttachments = assistant?.attachments ?? []
    if (assistantText || assistantAttachments.length > 0 || assistantImages.length > 0) {
      messages.push({
        role: "assistant",
        text: assistantText,
        attachments: assistantAttachments,
        imageAssetPointers: assistantImages,
      })
    }
  }

  if (messages.length === 0) return null
  return { sessionId, messages }
}
