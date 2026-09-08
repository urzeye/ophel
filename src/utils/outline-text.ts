/**
 * 大纲文本处理工具
 *
 * 统一清洗与规范化大纲中的标题与用户提问文本，
 * 剥离无意义的 Markdown 语法符号（引用、标题号、强调、列表标记等），
 * 保证大纲树展示的整洁与可读性。
 */

/**
 * 清洗大纲中展示的标题文本（特别是用户提问项）
 *
 * 处理规则：
 * 1. 规范化换行与移除不可见/零宽字符
 * 2. 移除行首的引用符号（包括单层与多层引用：`> `、`>> `、`> > ` 等）
 * 3. 移除行首的 Markdown 标题标记（`# ` 至 `###### `）及行末的闭合 `#`
 * 4. 移除行首的列表项标记（`- `、`* `、`+ `、`1. `、`1) `、任务列表 `- [ ] ` / `- [x] ` 等）
 * 5. 转换链接与图片为纯文本（`[text](url)` -> `text`, `![alt](url)` -> `alt`）
 * 6. 保护反斜杠转义字符（如 `\#`、`\*`）避免被后续修饰符剥离误删
 * 7. 移除行内修饰符号（粗体/斜体 `**` / `*` / `__` / `_`、行内代码 `` ` ``、删除线 `~~`）
 * 8. 还原反斜杠转义保护字符
 * 9. 连续换行和多余空白压缩为单空格
 * 10. 防御性兜底：清洗后若为空白，保留原始文本去除首尾空格后的结果
 */
export function cleanOutlineTitle(text: string): string {
  if (!text) return ""

  // 1. 规范化换行与移除不可见分隔符（如快速引用零宽字符）
  let result = text.replace(/\r\n?/g, "\n").replace(/[\u2062\u200B-\u200D\uFEFF]/g, "")

  // 2. 移除行首的引用符号（可能多层引用或带空格，如 "> ", ">> ", "> > "）
  result = result.replace(/(?:^|\n)\s*(?:>+\s*)+/g, " ")

  // 3. 移除行首的 1-6 级标题符号及末尾闭合的 "#"
  result = result.replace(/^\s{0,3}#{1,6}\s+/, "").replace(/\s+#+\s*$/, "")

  // 4. 移除行首的列表标记（如 "- [x] ", "- ", "* ", "+ ", "1. ", "1) "）
  result = result.replace(/^\s*(?:[-*+]\s+(?:\[[ xX]\]\s+)?|\d+[\.)]\s+)/, "")

  // 5. 图片与链接：![alt](url) -> alt, [text](url) -> text
  result = result.replace(/!\[([^\]]*)\]\([^)]+\)/g, "$1")
  result = result.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")

  // 6. 暂存保护反斜杠转义字符
  const escapedChars: string[] = []
  result = result.replace(/\\([\\`*_[\]{}()#+\-.!|>])/g, (_, char: string) => {
    escapedChars.push(char)
    return `\x00${escapedChars.length - 1}\x00`
  })

  // 7. 移除行内修饰符（粗体、斜体、行内代码、删除线）
  result = result.replace(/[`*_~]/g, "")

  // 8. 还原反斜杠转义字符
  result = result.replace(/\x00(\d+)\x00/g, (_, index: string) => {
    const i = parseInt(index, 10)
    return escapedChars[i] !== undefined ? escapedChars[i] : ""
  })

  // 9. 压缩多余空格与换行，trim
  result = result.replace(/\s+/g, " ").trim()

  // 10. 若清洗后全空（如用户输入仅为特殊符号），兜底返回原文本去除两端空格
  return result || text.trim()
}
