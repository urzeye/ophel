import hljs from "highlight.js/lib/core"

import { createMarkdownIt, renderMarkdown } from "../../utils/markdown"
;(
  globalThis as typeof globalThis & {
    __OphelMarkdownVendor?: {
      renderMarkdown: typeof renderMarkdown
      createMarkdownIt: typeof createMarkdownIt
      highlightCss: (code: string) => string
    }
  }
).__OphelMarkdownVendor = {
  renderMarkdown,
  createMarkdownIt,
  highlightCss: (code: string) => hljs.highlight(code, { language: "css" }).value,
}
