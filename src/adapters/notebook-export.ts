import { htmlToMarkdown } from "~utils/exporter"

/** 仅规范化正文副本，保留 Notebook 自定义组件内的标题、列表和表格。 */
export function notebookBodyToMarkdown(root: Element): string {
  const clone = root.cloneNode(true) as Element
  clone.querySelectorAll(".gh-inline-bookmark").forEach((element) => element.remove())
  clone
    .querySelectorAll(
      "labs-tailwind-structural-element-view-v2, paragraph-element-view, table-element-view, element-list-renderer",
    )
    .forEach((element) => element.replaceWith(...element.childNodes))

  clone.querySelectorAll('[role="heading"][aria-level]').forEach((element) => {
    const level = Number(element.getAttribute("aria-level"))
    if (!Number.isInteger(level) || level < 1 || level > 6) return
    const heading = document.createElement(`h${level}`)
    heading.textContent = (element.textContent ?? "").replace(/\s+/g, " ").trim()
    element.replaceWith(heading)
  })
  clone.querySelectorAll("div.paragraph.blockquote, div.paragraph.normal").forEach((element) => {
    const paragraph = document.createElement(
      element.classList.contains("blockquote") ? "blockquote" : "p",
    )
    paragraph.append(...element.childNodes)
    element.replaceWith(paragraph)
  })
  clone.querySelectorAll("button.citation-marker").forEach((element) => {
    element.replaceWith(document.createTextNode(`[${element.textContent?.trim() ?? ""}]`))
  })
  clone.querySelectorAll("table").forEach((table) => {
    const rows = Array.from(table.rows)
    const header = rows[0]?.querySelector("th") ? rows.shift() : null
    Array.from(table.children)
      .filter((element) => ["THEAD", "TBODY", "TFOOT"].includes(element.tagName))
      .forEach((element) => element.remove())
    if (header) {
      const head = document.createElement("thead")
      head.append(header)
      table.append(head)
    }
    if (rows.length) {
      const body = document.createElement("tbody")
      body.append(...rows)
      table.append(body)
    }
  })

  const walker = document.createTreeWalker(clone, NodeFilter.SHOW_TEXT)
  while (walker.nextNode()) {
    const text = walker.currentNode
    if (text.parentElement?.closest("pre, code, textarea, math, .katex")) continue
    text.textContent = text.textContent?.replace(/\s+/g, " ") ?? ""
  }
  return htmlToMarkdown(clone)
}
