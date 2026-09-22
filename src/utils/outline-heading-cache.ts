/**
 * 虚拟滚动站点的大纲缓存共享工具：
 * - parseMarkdownHeadings：从接口返回的 markdown 正文解析标题（跳过围栏代码块）；
 * - hashOutlineText：大纲条目 id 的短哈希；
 * - SessionOutlineCache：按会话 key 隔离的条目缓存，切换会话时自动清空。
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

/**
 * 会话作用域的大纲条目缓存：ensureSession 的 key 变化时自动清空，
 * 避免虚拟滚动站点切换对话后旧会话的条目污染新会话。
 */
export class SessionOutlineCache<T> {
  private sessionKey: string | null = null
  private readonly store = new Map<string, T>()

  /** 校验当前会话；key 变化时清空缓存并返回 true。 */
  ensureSession(key: string): boolean {
    if (key === this.sessionKey) return false
    this.sessionKey = key
    this.store.clear()
    return true
  }

  get size(): number {
    return this.store.size
  }

  get(key: string): T | undefined {
    return this.store.get(key)
  }

  set(key: string, value: T): void {
    this.store.set(key, value)
  }

  delete(key: string): void {
    this.store.delete(key)
  }

  clear(): void {
    this.store.clear()
  }

  values(): IterableIterator<T> {
    return this.store.values()
  }

  entries(): IterableIterator<[string, T]> {
    return this.store.entries()
  }
}
