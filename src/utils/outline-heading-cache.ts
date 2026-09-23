/**
 * 虚拟滚动站点的大纲缓存共享工具：
 * - parseMarkdownHeadings：从接口返回的 markdown 正文解析标题（跳过围栏代码块）；
 * - hashOutlineText：大纲条目 id 的短哈希；
 */

export interface ParsedMarkdownHeading {
  level: number
  text: string
}

export interface MarkdownHeadingSection {
  level: number
  text: string
  /** 该标题到下一个同级或更高级标题之间的正文（子标题行只保留文本，不含 # 标记） */
  body: string
}

/**
 * 提取 markdown 中的 ATX 标题及其章节正文（完整层级，不按 maxLevel 过滤）。
 * 章节边界 = 下一个同级或更高级标题；围栏代码块内的 # 行不算标题。
 */
export function parseMarkdownHeadingSections(markdown: string): MarkdownHeadingSection[] {
  const lines = markdown.split("\n")
  const headings: { level: number; text: string; lineIndex: number }[] = []
  let inFence = false
  let fenceChar = ""

  lines.forEach((line, lineIndex) => {
    const fenceMatch = line.match(/^\s*(`{3,}|~{3,})/)
    if (fenceMatch) {
      const marker = fenceMatch[1][0]
      if (!inFence) {
        inFence = true
        fenceChar = marker
      } else if (marker === fenceChar) {
        inFence = false
        fenceChar = ""
      }
      return
    }
    if (inFence) return

    const headingMatch = line.match(/^(#{1,6})\s+(.+?)\s*$/)
    if (!headingMatch) return
    // 去掉可选的闭合 # 序列
    const text = headingMatch[2].replace(/\s+#+$/, "").trim()
    if (text) {
      headings.push({ level: headingMatch[1].length, text, lineIndex })
    }
  })

  return headings.map((heading, index) => {
    let endLine = lines.length
    for (let i = index + 1; i < headings.length; i += 1) {
      if (headings[i].level <= heading.level) {
        endLine = headings[i].lineIndex
        break
      }
    }
    // 子标题行去掉 # 标记只留文本，与 DOM range 统计口径对齐
    const body = lines
      .slice(heading.lineIndex + 1, endLine)
      .map((line) => line.replace(/^#{1,6}\s+/, ""))
      .join("\n")
    return { level: heading.level, text: heading.text, body }
  })
}

/** 提取 markdown 中的 ATX 标题；围栏代码块内的 # 行不算标题。 */
export function parseMarkdownHeadings(markdown: string, maxLevel = 6): ParsedMarkdownHeading[] {
  return parseMarkdownHeadingSections(markdown)
    .filter((section) => section.level <= maxLevel)
    .map((section) => ({ level: section.level, text: section.text }))
}

/** djb2 短哈希，用于大纲条目 id 的文本区分段。 */
export function hashOutlineText(value: string): string {
  let hash = 5381
  for (let i = 0; i < value.length; i += 1) {
    hash = ((hash << 5) + hash + value.charCodeAt(i)) >>> 0
  }
  return hash.toString(16)
}

/**
 * 去掉 markdown 行内格式，返回接近页面渲染效果的纯文本。
 * 供接口回填条目的显示文本清洗与字数估算共用（DeepSeek 方案 C §8.1）。
 */
export function stripMarkdownInline(text: string): string {
  const stripped = text
    // DeepSeek 引用标记渲染后形态不同或不可见
    .replace(/\[reference:\d+\]/gi, "")
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]*)\]\[[^\]]*\]/g, "$1")
    .replace(/`([^`]*)`/g, "$1")
    .replace(/(\*\*|__)(.*?)\1/g, "$2")
    .replace(/([*_])(.*?)\1/g, "$2")
    .replace(/~~(.*?)~~/g, "$1")
    .replace(/<[^>]*>/g, "")
  return stripped.replace(/\s+/g, " ").trim()
}

/** 估算 markdown 正文的纯文本长度：剔除围栏代码块标记行后按行内规则清洗。近似值。 */
export function markdownPlainLength(markdown: string): number {
  const withoutFenceMarkers = markdown
    .split("\n")
    .filter((line) => !/^\s*(`{3,}|~{3,})/.test(line))
    .join("\n")
  return stripMarkdownInline(withoutFenceMarkers).length
}
