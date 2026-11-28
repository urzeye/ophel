/**
 * Kimi 会话接口导出解析模块（纯数据转换，无 DOM 依赖）
 *
 * 覆盖两类接口的统一解析：
 * - 分享页：POST /apiv2/kimi.gateway.chat.v1.ChatService/GetChatShare（share.messages 正序）
 * - 自有会话：POST /apiv2/kimi.gateway.chat.v1.ChatService/ListMessages（messages 倒序分页）
 *
 * 两者返回相同的 kimi.chat.v1.ChatMessage / Block 结构：
 * - 按 parentId 回溯激活主分支（过滤重新生成/编辑留下的旁支）
 * - 按 blocks 原始顺序保留多段思考链（think）与多段正文（text），不丢过渡段
 * - 解析 references 将正文里的 <REF>...</REF> 占位符转为可读 Markdown 链接或清理
 */

export interface KimiHistoryExportFile {
  kind: "image" | "file"
  name: string
  source: string
  type: string
  sizeLabel: string
}

export interface KimiHistoryExportReference {
  matchedText: string
  kind: "file" | "image" | "link" | "unknown"
  title: string
  url: string
  fileName: string
  ext: string
  links?: Array<{ title: string; url: string }>
}

export type KimiHistoryExportAssistantSegment =
  | { type: "think"; content: string }
  | { type: "text"; content: string; references: KimiHistoryExportReference[] }
  | { type: "file"; file: KimiHistoryExportFile }

export interface KimiHistoryExportMessage {
  id: string
  role: "user" | "assistant"
  requestText: string
  files: KimiHistoryExportFile[]
  segments: KimiHistoryExportAssistantSegment[]
}

export interface KimiHistoryExportData {
  chatId: string
  chatName: string
  messages: KimiHistoryExportMessage[]
}

export interface KimiInlineReferenceResolvers {
  resolveFile?: (reference: KimiHistoryExportReference) => string
  resolveImage?: (reference: KimiHistoryExportReference) => string
}

interface RawKimiMessage {
  id: string
  parentId: string
  childrenMessageIds: string[]
  role: string
  blocks: Record<string, unknown>[]
  references: Record<string, unknown>[]
}

const RAW_REF_TAG_REGEX = /<REF>([\s\S]*?)<\/REF>/gi

const asRecord = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null

const asRecordArray = (value: unknown): Record<string, unknown>[] =>
  Array.isArray(value)
    ? value.filter((item): item is Record<string, unknown> => asRecord(item) !== null)
    : []

const asString = (value: unknown): string => (typeof value === "string" ? value : "")

const asStringArray = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : []

const extractPathBasename = (path: string): string => {
  const cleaned = path.replace(/[?#].*$/, "").trim()
  if (!cleaned) return ""
  const parts = cleaned.split("/").filter(Boolean)
  const last = parts[parts.length - 1] || ""
  try {
    return decodeURIComponent(last)
  } catch {
    return last
  }
}

const extractFilenameFromSignUrl = (url: string): string => {
  if (!url) return ""
  try {
    const parsed = new URL(url, "https://www.kimi.com")
    const filenameParam = parsed.searchParams.get("filename")?.trim()
    if (filenameParam) return filenameParam
    return extractPathBasename(parsed.pathname)
  } catch {
    return ""
  }
}

export function formatKimiByteSize(sizeBytes: unknown): string {
  const numeric =
    typeof sizeBytes === "number"
      ? sizeBytes
      : typeof sizeBytes === "string" && sizeBytes.trim()
        ? Number(sizeBytes.trim())
        : Number.NaN

  if (!Number.isFinite(numeric) || numeric < 0) return ""
  if (numeric < 1024) return `${Math.round(numeric)} B`

  const units = ["KB", "MB", "GB", "TB"]
  let value = numeric / 1024
  let unitIndex = 0
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024
    unitIndex += 1
  }
  const formatted = value >= 100 ? value.toFixed(0) : value.toFixed(1).replace(/\.0$/, "")
  return `${formatted} ${units[unitIndex]}`
}

const normalizeRawMessage = (raw: Record<string, unknown>): RawKimiMessage | null => {
  const id = asString(raw.id).trim()
  const role = asString(raw.role).trim().toLowerCase()
  // 保留无 role 但含 id 的中间结构节点以维持 parentId 链完整，渲染阶段再忽略非 user/assistant 节点
  if (!role && !id) return null

  return {
    id,
    parentId: asString(raw.parentId).trim(),
    childrenMessageIds: asStringArray(raw.childrenMessageIds)
      .map((childId) => childId.trim())
      .filter(Boolean),
    role,
    blocks: asRecordArray(raw.blocks),
    references: asRecordArray(raw.references),
  }
}

/**
 * 按 Kimi 消息树还原唯一激活主分支（严格正序）。
 *
 * - ListMessages 返回倒序（messages[0] 为最新叶子节点）
 * - GetChatShare 返回正序（最后一条为最新叶子节点）
 *
 * 从叶子节点沿 parentId 向上回溯并反转；检测到环路或非根父节点缺失时返回 null 交由调用方回退。
 */
const resolveKimiActiveBranch = (
  messages: RawKimiMessage[],
  chatId: string,
  order: "asc" | "desc",
): RawKimiMessage[] | null => {
  if (messages.length === 0) return []

  const unique: RawKimiMessage[] = []
  const byId = new Map<string, RawKimiMessage>()
  for (const message of messages) {
    if (!message.id) {
      unique.push(message)
      continue
    }
    if (byId.has(message.id)) continue
    byId.set(message.id, message)
    unique.push(message)
  }

  const isRootParent = (parentId: string) => !parentId || (Boolean(chatId) && parentId === chatId)

  // 仅当所有消息均不含指向其他消息的 parentId 时（如单条根消息或无树结构老数据），直接按顺序规整
  const hasNonRootParent = unique.some((message) => !isRootParent(message.parentId))
  if (!hasNonRootParent) {
    return order === "desc" ? [...unique].reverse() : unique
  }

  const seed = order === "desc" ? unique[0] : unique[unique.length - 1]
  if (!seed) return []

  // 若种子节点仍有已收录子节点，沿最后一个已收录子节点走至激活叶节点
  let leaf = seed
  const downVisited = new Set<string>()
  while (leaf.id) {
    if (downVisited.has(leaf.id)) return null
    downVisited.add(leaf.id)

    let nextChild: RawKimiMessage | undefined
    for (let i = leaf.childrenMessageIds.length - 1; i >= 0; i -= 1) {
      const candidate = byId.get(leaf.childrenMessageIds[i])
      if (candidate) {
        nextChild = candidate
        break
      }
    }
    if (!nextChild) break
    leaf = nextChild
  }

  // 从叶子沿 parentId 回溯至根；非根父节点缺失时拒绝导出，避免静默截断早期轮次
  const chain: RawKimiMessage[] = []
  const upVisited = new Set<string>()
  let current: RawKimiMessage | undefined = leaf
  while (current) {
    if (current.id) {
      if (upVisited.has(current.id)) return null
      upVisited.add(current.id)
    }
    chain.push(current)

    const parentId = current.parentId
    if (isRootParent(parentId)) break

    const parent = byId.get(parentId)
    if (!parent) return null
    current = parent
  }

  return chain.reverse()
}

const parseKimiFileRecord = (fileRecord: Record<string, unknown>): KimiHistoryExportFile | null => {
  const meta = asRecord(fileRecord.meta)
  const blob = asRecord(fileRecord.blob)
  const source = (
    asString(blob?.signUrl) ||
    asString(blob?.url) ||
    asString(fileRecord.signUrl) ||
    asString(fileRecord.url)
  ).trim()

  const contentType = asString(meta?.contentType || fileRecord.contentType).trim()
  const metaType = asString(meta?.type || fileRecord.type)
    .trim()
    .toUpperCase()
  const ext = asString(meta?.ext || fileRecord.ext).trim()
  const name = (
    asString(meta?.name) ||
    asString(fileRecord.name) ||
    asString(fileRecord.fileName) ||
    extractFilenameFromSignUrl(source)
  ).trim()

  if (!name && !source) return null

  const isImage = metaType === "FILE_TYPE_IMAGE" || contentType.toLowerCase().startsWith("image/")

  return {
    kind: isImage ? "image" : "file",
    name: name || (isImage ? "uploaded image" : "attachment"),
    source,
    type: ext,
    sizeLabel: formatKimiByteSize(meta?.sizeBytes ?? fileRecord.sizeBytes),
  }
}

const parseKimiImageRecord = (
  imageRecord: Record<string, unknown>,
): KimiHistoryExportFile | null => {
  const source = (
    asString(imageRecord.signUrl) ||
    asString(imageRecord.url) ||
    asString(imageRecord.imageUrl) ||
    asString(imageRecord.originalUrl)
  ).trim()
  if (!source) return null

  const name = (
    asString(imageRecord.title) ||
    asString(imageRecord.alt) ||
    asString(imageRecord.name) ||
    extractFilenameFromSignUrl(source) ||
    "image"
  ).trim()

  return {
    kind: "image",
    name,
    source,
    type: "",
    sizeLabel: "",
  }
}

const extractLinkFromRefItem = (
  item: Record<string, unknown>,
): { title: string; url: string } | null => {
  const candidates = [
    asRecord(item.searchChunk),
    asRecord(item.search),
    asRecord(item.web),
    asRecord(item.url),
    asRecord(item.urlRef),
    item,
  ].filter((candidate): candidate is Record<string, unknown> => candidate !== null)

  for (const candidate of candidates) {
    const url = (
      asString(candidate.url) ||
      asString(candidate.link) ||
      asString(candidate.href)
    ).trim()
    if (!/^https?:\/\//i.test(url)) continue
    const title = (
      asString(candidate.title) ||
      asString(candidate.siteName) ||
      asString(candidate.name) ||
      url
    ).trim()
    return { title, url }
  }

  return null
}

const parseKimiReferences = (
  rawReferences: Record<string, unknown>[],
): KimiHistoryExportReference[] => {
  const parsed: KimiHistoryExportReference[] = []

  for (const rawRef of rawReferences) {
    const matchedText = asString(rawRef.matchedText)
    if (!matchedText) continue

    const items = asRecordArray(rawRef.items)
    let fileRef: KimiHistoryExportReference | null = null
    let imageRef: KimiHistoryExportReference | null = null
    const links: Array<{ title: string; url: string }> = []

    for (const item of items) {
      const fileEntry = asRecord(item.file)
      if (fileEntry && !fileRef) {
        const innerFile = asRecord(fileEntry.file)
        const meta = asRecord(innerFile?.meta)
        const blob = asRecord(innerFile?.blob)
        const url = (
          asString(blob?.signUrl) ||
          asString(blob?.url) ||
          asString(fileEntry.downloadUrl)
        ).trim()
        const fileName = (
          asString(fileEntry.fileName) ||
          asString(meta?.name) ||
          extractPathBasename(asString(fileEntry.sandboxUri)) ||
          extractFilenameFromSignUrl(url)
        ).trim()
        const ext = asString(meta?.ext).trim()
        fileRef = {
          matchedText,
          kind: "file",
          title: fileName,
          url,
          fileName,
          ext,
        }
        continue
      }

      const imageEntry = asRecord(item.image) || asRecord(item.imageItem)
      if (imageEntry && !imageRef) {
        const parsedImage = parseKimiImageRecord(imageEntry)
        if (parsedImage) {
          imageRef = {
            matchedText,
            kind: "image",
            title: parsedImage.name,
            url: parsedImage.source,
            fileName: parsedImage.name,
            ext: "",
          }
          continue
        }
      }

      const link = extractLinkFromRefItem(item)
      if (link && !links.some((existing) => existing.url === link.url)) {
        links.push(link)
      }
    }

    if (fileRef) {
      parsed.push(fileRef)
    } else if (imageRef) {
      parsed.push(imageRef)
    } else if (links.length > 0) {
      parsed.push({
        matchedText,
        kind: "link",
        title: links[0].title,
        url: links[0].url,
        fileName: "",
        ext: "",
        links,
      })
    } else {
      parsed.push({
        matchedText,
        kind: "unknown",
        title: "",
        url: "",
        fileName: "",
        ext: "",
      })
    }
  }

  return parsed
}

const escapeInlineLinkLabel = (label: string): string => label.replace(/[[\]]/g, "\\$&")

const escapeInlineLinkUrl = (url: string): string =>
  url.replace(/\(/g, "%28").replace(/\)/g, "%29").replace(/\s/g, "%20")

const formatInlineCode = (value: string): string => {
  if (!value) return ""
  const matches = value.match(/`+/g)
  const fenceLength = matches ? Math.max(...matches.map((m) => m.length)) + 1 : 1
  const fence = "`".repeat(fenceLength)
  const needsPadding = value.startsWith("`") || value.endsWith("`")
  return needsPadding ? `${fence} ${value} ${fence}` : `${fence}${value}${fence}`
}

const escapeRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")

/**
 * 将正文中来自 Kimi 接口的 <REF>...</REF> 占位标记替换为标准 Markdown 链接或清理。
 */
export function resolveKimiTextReferences(
  text: string,
  references: KimiHistoryExportReference[],
  resolvers: KimiInlineReferenceResolvers = {},
): string {
  const replacementByToken = new Map<string, string>()

  for (const reference of references) {
    if (!reference.matchedText || !text.includes(reference.matchedText)) continue
    if (replacementByToken.has(reference.matchedText)) continue

    let replacement = ""
    if (reference.kind === "file") {
      if (resolvers.resolveFile) {
        replacement = resolvers.resolveFile(reference)
      } else if (reference.fileName && reference.url) {
        replacement = `[${escapeInlineLinkLabel(reference.fileName)}](${escapeInlineLinkUrl(reference.url)})`
      } else if (reference.fileName) {
        replacement = formatInlineCode(reference.fileName)
      }
    } else if (reference.kind === "image") {
      if (resolvers.resolveImage) {
        replacement = resolvers.resolveImage(reference)
      } else if (reference.url) {
        replacement = `![${escapeInlineLinkLabel(reference.title || "image")}](${escapeInlineLinkUrl(reference.url)})`
      }
    } else if (reference.kind === "link") {
      const linkItems = reference.links?.length
        ? reference.links
        : reference.url
          ? [{ title: reference.title || reference.url, url: reference.url }]
          : []
      replacement = linkItems
        .map(
          (item) =>
            `[${escapeInlineLinkLabel(item.title || item.url)}](${escapeInlineLinkUrl(item.url)})`,
        )
        .join(" ")
    }

    replacementByToken.set(reference.matchedText, replacement)
  }

  const tokenPatterns = Array.from(replacementByToken.keys())
    .sort((a, b) => b.length - a.length)
    .map(escapeRegExp)

  // 单次扫描同时处理已知 references 与裸 <REF>...</REF> 兜底，避免对已生成内容做二次替换
  const combinedPattern = new RegExp([...tokenPatterns, RAW_REF_TAG_REGEX.source].join("|"), "gi")
  const result = text.replace(combinedPattern, (matched, inner?: string) => {
    const exactReplacement = replacementByToken.get(matched)
    if (exactReplacement !== undefined) return exactReplacement

    if (inner !== undefined) {
      const trimmed = inner.trim()
      if (/^file✦/i.test(trimmed)) {
        const fallbackName = extractPathBasename(trimmed.replace(/^file✦/i, ""))
        return fallbackName ? formatInlineCode(fallbackName) : ""
      }
      return ""
    }

    return matched
  })

  return result
    .replace(/\r\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
}

const parseKimiRawMessages = (
  rawMessages: unknown[],
  chatId: string,
  chatName: string,
  order: "asc" | "desc",
): KimiHistoryExportData | null => {
  const normalized = asRecordArray(rawMessages)
    .map(normalizeRawMessage)
    .filter((message): message is RawKimiMessage => message !== null)

  if (normalized.length === 0) return null

  const branch = resolveKimiActiveBranch(normalized, chatId, order)
  if (!branch || branch.length === 0) return null

  const messages: KimiHistoryExportMessage[] = []

  for (const message of branch) {
    if (message.role === "user") {
      const textParts: string[] = []
      const files: KimiHistoryExportFile[] = []

      for (const block of message.blocks) {
        const textBlock = asRecord(block.text)
        const textContent = asString(textBlock?.content).trim()
        if (textContent) {
          textParts.push(textContent)
        }

        const fileBlock = asRecord(block.file)
        if (fileBlock) {
          const parsedFile = parseKimiFileRecord(fileBlock)
          if (parsedFile) files.push(parsedFile)
        }

        const imageBlock = asRecord(block.image)
        if (imageBlock) {
          const parsedImage = parseKimiImageRecord(imageBlock)
          if (parsedImage) files.push(parsedImage)
        }
      }

      const requestText = textParts.join("\n\n").trim()
      if (!requestText && files.length === 0) continue

      messages.push({
        id: message.id,
        role: "user",
        requestText,
        files,
        segments: [],
      })
      continue
    }

    if (message.role === "assistant") {
      const references = parseKimiReferences(message.references)
      const segments: KimiHistoryExportAssistantSegment[] = []

      // 按 blocks 原始顺序输出思考链与正文片段，保留工具调用前过渡段与收尾正文的上下文顺序
      for (const block of message.blocks) {
        const thinkBlock = asRecord(block.think)
        const thinkContent = asString(thinkBlock?.content).trim()
        if (thinkContent) {
          segments.push({ type: "think", content: thinkContent })
        }

        const textBlock = asRecord(block.text)
        const textContent = asString(textBlock?.content).trim()
        if (textContent) {
          segments.push({ type: "text", content: textContent, references })
        }

        const imageBlock = asRecord(block.image)
        if (imageBlock) {
          const parsedImage = parseKimiImageRecord(imageBlock)
          if (parsedImage) segments.push({ type: "file", file: parsedImage })
        }

        const fileBlock = asRecord(block.file)
        if (fileBlock) {
          const parsedFile = parseKimiFileRecord(fileBlock)
          if (parsedFile) segments.push({ type: "file", file: parsedFile })
        }
      }

      if (segments.length === 0) continue

      messages.push({
        id: message.id,
        role: "assistant",
        requestText: "",
        files: [],
        segments,
      })
    }
  }

  if (messages.length === 0) return null
  return { chatId, chatName, messages }
}

/**
 * 解析分享页 GetChatShare 响应。
 */
export function parseKimiShareExport(payload: unknown): KimiHistoryExportData | null {
  const share = asRecord(asRecord(payload)?.share)
  if (!share) return null

  const chat = asRecord(share.chat)
  const chatId = asString(chat?.id).trim()
  const chatName = asString(chat?.name).trim()
  const rawMessages = Array.isArray(share.messages) ? share.messages : []

  return parseKimiRawMessages(rawMessages, chatId, chatName, "asc")
}

/**
 * 解析自有对话页 ListMessages 全部分页合并后的原始消息列表。
 */
export function parseKimiListMessagesExport(
  rawMessages: unknown[],
  chatId: string,
  chatName = "",
): KimiHistoryExportData | null {
  return parseKimiRawMessages(rawMessages, chatId.trim(), chatName.trim(), "desc")
}
