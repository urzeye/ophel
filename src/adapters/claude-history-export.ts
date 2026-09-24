import { parseClaudeHistoryBranch, type ClaudeHistoryMessage } from "./claude-history-outline"

/** create_file 工具产出的文档（Artifact/文档面板内容，file_text 为原始源码） */
export interface ClaudeHistoryExportDocument {
  /** 显示标题（同 path 的 present_files name，兜底 path basename） */
  name: string
  /** /mnt/user-data/outputs/ 下的文件路径 */
  path: string
  /** 文档正文（markdown/html 源码）；二进制或缺失为 null（导出占位符） */
  content: string | null
  /** present_files 给的 mime_type（兜底按 path 扩展名推断），决定导出的呈现方式 */
  mimeType: string
}

/** 用户上传的图片/文件（files 字段；preview_url 为同源可下载地址） */
export interface ClaudeHistoryExportUserFile {
  fileName: string
  fileUuid: string
  fileKind: string
  previewUrl: string
}

/** 用户上传的文本类附件（attachments 字段，extracted_content 为全文） */
export interface ClaudeHistoryExportUserAttachment {
  fileName: string
  extractedContent: string
}

/** 助手回复的有序片段：正文文本与文档块按接口块顺序交错 */
export type ClaudeHistoryExportSegment =
  | { type: "text"; text: string }
  | { type: "document"; document: ClaudeHistoryExportDocument }

/** chat_conversations 中一条消息提取出的导出素材（格式化由适配器负责） */
export interface ClaudeHistoryExportMessage {
  role: "user" | "assistant"
  /** 用户提问正文（text 内容块拼接） */
  requestText: string
  /** 用户文本类附件（仅 human） */
  attachments: ClaudeHistoryExportUserAttachment[]
  /** 用户图片/文件（仅 human） */
  files: ClaudeHistoryExportUserFile[]
  /** 助手回复有序片段（仅 assistant） */
  segments: ClaudeHistoryExportSegment[]
  /** 思考链正文（thinking 内容块的 thinking 字段拼接） */
  thinkingMarkdown: string
  /** 思考链标题（首个 summary，适配器作引用块标题） */
  thinkingTitle: string
}

export interface ClaudeHistoryExportData {
  sessionId: string
  messages: ClaudeHistoryExportMessage[]
}

const asRecord = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === "object" ? (value as Record<string, unknown>) : null

const asObjectArray = <T>(value: unknown): T[] =>
  Array.isArray(value) ? (value.filter(Boolean) as T[]) : []

interface ClaudeContentBlock {
  type?: unknown
  text?: unknown
  thinking?: unknown
  summaries?: unknown
  id?: unknown
  name?: unknown
  input?: unknown
  content?: unknown
  tool_use_id?: unknown
  is_error?: unknown
}

const pathBasename = (path: string): string => path.split("/").filter(Boolean).pop() || path

const firstSummaryTitle = (blocks: ClaudeContentBlock[]): string => {
  const thinking = blocks.find((block) => block.type === "thinking")
  const first = asObjectArray<{ summary?: unknown }>(thinking?.summaries)[0]
  return typeof first?.summary === "string" ? first.summary.trim() : ""
}

const parseUserFiles = (message: ClaudeHistoryMessage): ClaudeHistoryExportUserFile[] =>
  asObjectArray<Record<string, unknown>>(message.files).map((file) => ({
    fileName: typeof file.file_name === "string" ? file.file_name : "",
    fileUuid:
      typeof file.file_uuid === "string"
        ? file.file_uuid
        : typeof file.uuid === "string"
          ? file.uuid
          : "",
    fileKind: typeof file.file_kind === "string" ? file.file_kind : "file",
    previewUrl: typeof file.preview_url === "string" ? file.preview_url : "",
  }))

const parseUserAttachments = (message: ClaudeHistoryMessage): ClaudeHistoryExportUserAttachment[] =>
  asObjectArray<Record<string, unknown>>(message.attachments).map((attachment) => ({
    fileName: typeof attachment.file_name === "string" ? attachment.file_name : "",
    extractedContent:
      typeof attachment.extracted_content === "string" ? attachment.extracted_content : "",
  }))

/** present_files 的 tool_result 给出文件卡片显示名与 mime（按 file_path 索引） */
const collectPresentedFileNames = (
  branch: ClaudeHistoryMessage[],
): Map<string, { name: string; mimeType: string }> => {
  const presented = new Map<string, { name: string; mimeType: string }>()
  for (const message of branch) {
    for (const block of asObjectArray<ClaudeContentBlock>(message.content)) {
      if (block.type !== "tool_result" || block.name !== "present_files") continue
      for (const entry of asObjectArray<Record<string, unknown>>(block.content)) {
        if (entry.type !== "local_resource" || typeof entry.file_path !== "string") continue
        presented.set(entry.file_path, {
          name: typeof entry.name === "string" ? entry.name : "",
          mimeType: typeof entry.mime_type === "string" ? entry.mime_type : "",
        })
      }
    }
  }
  return presented
}

const toDocumentSegment = (
  block: ClaudeContentBlock,
  presented: Map<string, { name: string; mimeType: string }>,
): ClaudeHistoryExportSegment | null => {
  const input = asRecord(block.input)
  const path = typeof input?.path === "string" ? input.path : ""
  if (!path) return null

  const display = presented.get(path)
  return {
    type: "document",
    document: {
      name: display?.name || pathBasename(path),
      path,
      content: typeof input?.file_text === "string" ? (input.file_text as string) : null,
      mimeType: display?.mimeType || (path.endsWith(".md") ? "text/markdown" : ""),
    },
  }
}

const joinBlockText = (blocks: ClaudeContentBlock[]): string =>
  blocks
    .filter((block) => block.type === "text" && typeof block.text === "string")
    .map((block) => block.text as string)
    .join("\n\n")

/** 创建失败的 tool_use id 集合（其 tool_result.is_error 为 true；DOM 不会渲染对应卡片） */
const collectFailedToolUseIds = (branch: ClaudeHistoryMessage[]): Set<string> => {
  const failed = new Set<string>()
  for (const message of branch) {
    for (const block of asObjectArray<ClaudeContentBlock>(message.content)) {
      if (
        block.type === "tool_result" &&
        block.is_error === true &&
        typeof block.tool_use_id === "string"
      ) {
        failed.add(block.tool_use_id)
      }
    }
  }
  return failed
}

/**
 * 解析 chat_conversations 响应为导出消息序列（激活分支、完整历史）。
 * 完整性门槛（无法证明历史完整时返回 null，调用方回退滚动收集）：
 * current_leaf_message_uuid 未收录（疑似分页）、分支链顶 parent 不是哨兵零 uuid。
 * 其余内容一律提取或跳过，不回退：
 * - create_file → 文档片段（同 path 重复创建时仅最后一次保留正文，
 *   早前版本降级为占位符）；缺 file_text（二进制）为占位符；创建失败（is_error）跳过；
 * - bash_tool/view/present_files/tool_result/token_budget 及未知 tool_use 一律跳过
 *   （DOM 导出本就不含工具过程，保持等价）；
 * - 用户 attachments/files 直接提取（图片 preview_url 同源可下载，文本附件有全文）。
 */
export function parseClaudeHistoryExport(payload: unknown): ClaudeHistoryExportData | null {
  const parsed = parseClaudeHistoryBranch(payload)
  if (!parsed) return null
  if (parsed.leafMissing || parsed.truncated) return null

  const presented = collectPresentedFileNames(parsed.branch)
  // 同 path 重复 create_file：仅最后一次保留正文，早前版本降级为占位符
  const documentByPath = new Map<string, ClaudeHistoryExportDocument>()
  const failedToolUseIds = collectFailedToolUseIds(parsed.branch)

  const exportMessages: ClaudeHistoryExportMessage[] = []
  for (const message of parsed.branch) {
    const blocks = asObjectArray<ClaudeContentBlock>(message.content)

    if (message.sender === "human") {
      exportMessages.push({
        role: "user",
        requestText: joinBlockText(blocks).trim(),
        attachments: parseUserAttachments(message),
        files: parseUserFiles(message),
        segments: [],
        thinkingMarkdown: "",
        thinkingTitle: "",
      })
      continue
    }

    if (message.sender === "assistant") {
      const segments: ClaudeHistoryExportSegment[] = []
      for (const block of blocks) {
        if (block.type === "text" && typeof block.text === "string" && block.text.trim()) {
          segments.push({ type: "text", text: block.text })
          continue
        }
        if (block.type === "tool_use" && block.name === "create_file") {
          if (typeof block.id === "string" && failedToolUseIds.has(block.id)) continue
          const segment = toDocumentSegment(block, presented)
          if (!segment || segment.type !== "document") continue
          const previous = documentByPath.get(segment.document.path)
          if (previous) previous.content = null
          documentByPath.set(segment.document.path, segment.document)
          segments.push(segment)
        }
      }

      exportMessages.push({
        role: "assistant",
        requestText: "",
        attachments: [],
        files: [],
        segments,
        thinkingMarkdown: blocks
          .filter((block) => block.type === "thinking" && typeof block.thinking === "string")
          .map((block) => block.thinking as string)
          .join("\n\n")
          .trim(),
        thinkingTitle: firstSummaryTitle(blocks),
      })
    }
  }

  if (exportMessages.length === 0) return null
  return { sessionId: parsed.sessionId, messages: exportMessages }
}
