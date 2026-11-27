import MarkdownIt from "markdown-it"

import type { ExportLifecycleContext } from "../../src/adapters/base"
import { KimiAdapter } from "../../src/adapters/kimi"
import { htmlToMarkdown } from "../../src/utils/exporter"

const adapter = new KimiAdapter()
const renderer = new MarkdownIt()
const results: { name: string; passed: boolean; error?: string }[] = []
const splitTable = `<div class="table markdown-table" role="table">
  <div class="table-header"><table class="header-table"><thead><tr><th>序号</th><th>名称</th><th>类型</th><th>说明<button>Copy</button></th></tr></thead></table></div>
  <div class="table-body"><table class="body-table"><tbody>
    <tr><td>1</td><td>示例 A</td><td>基础</td><td>第一行示例内容</td></tr>
    <tr><td>2</td><td>示例 B</td><td>进阶</td><td>第二行示例内容</td></tr>
    <tr><td>3</td><td>示例 C</td><td>高级</td><td>第三行示例内容</td></tr>
  </tbody></table></div>
</div>`

const parse = (html: string): HTMLElement => {
  const root = document.createElement("div")
  root.innerHTML = html
  return root
}
const assert = (condition: boolean, message: string): void => {
  if (!condition) throw new Error(message)
}
const extract = (html: string): string =>
  adapter.extractAssistantResponseText(parse(`<div class="markdown">${html}</div>`))
const render = (markdown: string): HTMLElement => parse(renderer.render(markdown))
const check = (name: string, run: () => void): void => {
  try {
    run()
    results.push({ name, passed: true })
  } catch (error) {
    results.push({ name, passed: false, error: String(error) })
  }
}

check("split table renders all rows in one table", () => {
  const markdown = extract(splitTable)
  const html = render(markdown)
  assert(html.querySelectorAll("table").length === 1, markdown)
  assert(html.querySelectorAll("tbody tr").length === 3, markdown)
  assert(html.querySelectorAll("thead th").length === 4, markdown)
  assert(!markdown.includes("Copy"), markdown)
})

check("numbered heading and body retain paragraph separation", () => {
  const markdown = extract(
    '<div class="paragraph"><strong>1. 标题</strong>\n正文</div><div class="paragraph">下一段</div>',
  )
  const html = render(markdown)
  assert(html.querySelectorAll("p").length === 3, markdown)
  assert(html.querySelector("p")?.textContent === "1. 标题", markdown)
})

check("adjacent paragraphs do not collapse", () => {
  const markdown = extract('<div class="paragraph">First</div><div class="paragraph">Second</div>')
  assert(render(markdown).querySelectorAll("p").length === 2, markdown)
})

check("multiple split tables keep their own rows", () => {
  const markdown = extract(`${splitTable}<div class="paragraph">Between</div>${splitTable}`)
  const tables = render(markdown).querySelectorAll("table")
  assert(tables.length === 2, markdown)
  assert(
    Array.from(tables).every((table) => table.querySelectorAll("tbody tr").length === 3),
    markdown,
  )
})

check("legacy table export stays unchanged", () => {
  const html =
    "<table><thead><tr><th>Name</th></tr></thead><tbody><tr><td>A</td></tr></tbody></table>"
  assert(extract(html) === htmlToMarkdown(parse(html)), "Legacy table output changed")
})

check("incomplete split table is not discarded", () => {
  const root = parse(splitTable)
  root.querySelector(".header-table")!.remove()
  assert(extract(root.innerHTML).includes("示例 C"), "Missing body-only table")
  const header = parse(splitTable)
  header.querySelector(".body-table")!.remove()
  assert(extract(header.innerHTML).includes("序号"), "Missing header-only table")
})

check("lists and code retain their structure", () => {
  const markdown = extract(
    '<ul><li><div class="paragraph">First</div><ul><li><div class="paragraph">Nested</div></li></ul></li><li><div class="paragraph">Second</div></li></ul><pre><code>first\nsecond</code></pre><div class="paragraph">Inline <code>first\nsecond</code></div>',
  )
  const html = render(markdown)
  assert(html.querySelectorAll("li").length === 3, markdown)
  assert(html.querySelectorAll("ul ul").length === 1, markdown)
  assert(html.querySelector("pre code")?.textContent === "first\nsecond\n", markdown)
  assert(markdown.includes("`first\nsecond`"), markdown)
})

check("source DOM is unchanged and repeated extraction is stable", () => {
  const root = parse(`<div class="markdown">${splitTable}<div class="paragraph">Text</div></div>`)
  const before = root.innerHTML
  const first = adapter.extractAssistantResponseText(root)
  assert(adapter.extractAssistantResponseText(root) === first, "Repeated export changed")
  assert(root.innerHTML === before, "Source DOM was modified")
})

check("shared converter retains its existing behavior", () => {
  const html = '<div class="paragraph"><strong>Title</strong>\nBody</div>'
  assert(htmlToMarkdown(parse(html)) === "**Title**\nBody", "Shared paragraph behavior changed")
  assert(
    render(htmlToMarkdown(parse(splitTable))).querySelectorAll("tbody tr").length === 0,
    "Shared split table behavior changed",
  )
})

const context: ExportLifecycleContext = {
  conversationId: "kimi-export-regression",
  format: "markdown",
  includeThoughts: true,
  packaging: "markdown",
}
await adapter.prepareConversationExport(context)
check("optional thoughts use the same table and paragraph normalization", () => {
  const root = parse(
    `<div class="toolcall-container thinking-container"><div class="markdown">${splitTable}<div class="paragraph"><strong>Thought</strong>\nDetail</div></div></div><div class="markdown"><div class="paragraph">Answer</div></div>`,
  )
  const markdown = adapter.extractAssistantResponseText(root)
  const html = render(markdown)
  assert(html.querySelectorAll("blockquote table tbody tr").length === 3, markdown)
  assert(html.querySelectorAll("blockquote p").length === 3, markdown)
  assert(markdown.endsWith("Answer"), markdown)
})
await adapter.restoreConversationAfterExport(context, null)

check("thoughts remain excluded by default", () => {
  const markdown = adapter.extractAssistantResponseText(
    parse(
      '<div class="toolcall-container thinking-container"><div class="markdown">Hidden thought</div></div><div class="markdown"><div class="paragraph">Answer</div></div>',
    ),
  )
  assert(markdown === "Answer", markdown)
})

const conversation = parse(
  `<div class="chat-content-list"><div class="chat-content-item chat-content-item-assistant"><div class="segment segment-assistant"><div class="segment-content-box"><div class="markdown-container"><div class="markdown">${splitTable}<div class="paragraph"><strong>1. 标题</strong>\n正文</div></div></div></div></div></div></div>`,
)
conversation.hidden = true
document.body.append(conversation)
const messages = await adapter.extractExportMessages(context)
const bundle = await adapter.extractExportBundle(context)
check("full conversation and bundle export include the corrected content", () => {
  assert(messages?.length === 1 && messages[0].role === "assistant", "Missing assistant message")
  assert(JSON.stringify(bundle?.messages) === JSON.stringify(messages), "Bundle content differs")
  const html = render(messages![0].content)
  assert(html.querySelectorAll("tbody tr").length === 3, "Missing table rows")
  assert(html.querySelectorAll("p").length === 2, "Missing paragraph breaks")
})
conversation.remove()

Object.assign(window, { kimiExportResults: results })
document.getElementById("results")!.textContent = JSON.stringify(results, null, 2)
if (results.some((result) => !result.passed))
  throw new Error("Kimi export regression checks failed")
