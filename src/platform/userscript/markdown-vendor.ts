import hljs from "highlight.js/lib/core"

import { createCommonmarkParser, createMarkdownIt, renderMarkdown } from "../../utils/markdown"
;(
  globalThis as typeof globalThis & {
    __OphelMarkdownVendor?: {
      renderMarkdown: typeof renderMarkdown
      createMarkdownIt: typeof createMarkdownIt
      createCommonmarkParser: typeof createCommonmarkParser
      highlightCss: (code: string) => string
    }
  }
).__OphelMarkdownVendor = {
  renderMarkdown,
  createMarkdownIt,
  createCommonmarkParser,
  highlightCss: (code: string) => hljs.highlight(code, { language: "css" }).value,
}
