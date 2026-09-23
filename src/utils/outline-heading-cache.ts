/**
 * 虚拟滚动站点的大纲缓存共享工具：
 * - parseMarkdownHeadings：从接口返回的 markdown 正文解析标题（跳过围栏代码块）；
 * - hashOutlineText：大纲条目 id 的短哈希；
 */

export interface ParsedMarkdownHeading {
  level: number
  text: string
}

/** 提取 markdown 中的 ATX 标题；围栏代码块内的 # 行不算标题。 */
export function parseMarkdownHeadings(markdown: string, maxLevel = 6): ParsedMarkdownHeading[] {
  const headings: ParsedMarkdownHeading[] = []
  let inFence = false
  let fenceChar = ""

  for (const line of markdown.split("\n")) {
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
      continue
    }
    if (inFence) continue

    const headingMatch = line.match(/^(#{1,6})\s+(.+?)\s*$/)
    if (!headingMatch) continue
    const level = headingMatch[1].length
    if (level > maxLevel) continue
    // 去掉可选的闭合 # 序列
    const text = headingMatch[2].replace(/\s+#+$/, "").trim()
    if (text) headings.push({ level, text })
  }

  return headings
}

/** djb2 短哈希，用于大纲条目 id 的文本区分段。 */
export function hashOutlineText(value: string): string {
  let hash = 5381
  for (let i = 0; i < value.length; i += 1) {
    hash = ((hash << 5) + hash + value.charCodeAt(i)) >>> 0
  }
  return hash.toString(16)
}
