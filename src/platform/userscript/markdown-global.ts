import { getKatexStylesText } from "./katex"

type RenderMarkdownOptions = {
  enableMath?: boolean
}

type MarkdownVendor = {
  renderMarkdown: (
    content: string,
    highlightVariables?: boolean,
    options?: RenderMarkdownOptions,
  ) => string
}

function getMarkdownVendor(): MarkdownVendor {
  const vendor = (globalThis as typeof globalThis & { __OphelMarkdownVendor?: MarkdownVendor })
    .__OphelMarkdownVendor

  if (!vendor || typeof vendor.renderMarkdown !== "function") {
    throw new Error("[Ophel] Markdown vendor runtime is missing")
  }

  return vendor
}

export const renderMarkdown = (
  content: string,
  highlightVariables = true,
  options: RenderMarkdownOptions = {},
): string => getMarkdownVendor().renderMarkdown(content, highlightVariables, options)

export const getMathStyles = (): string => getKatexStylesText()

export const getHighlightStyles = (): string => {
  if (typeof window === "undefined") return ""
  return window.__OPHEL_MARKDOWN_PREVIEW_STYLES__ || ""
}
