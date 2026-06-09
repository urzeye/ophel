import { renderMarkdown } from "../../utils/markdown"
;(
  globalThis as typeof globalThis & {
    __OphelMarkdownVendor?: {
      renderMarkdown: typeof renderMarkdown
    }
  }
).__OphelMarkdownVendor = {
  renderMarkdown,
}
