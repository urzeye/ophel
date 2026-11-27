type RenderMarkdownOptions = {
  enableMath?: boolean
}

type MarkdownItLike = {
  render: (content: string) => string
}

type MarkdownVendor = {
  highlightCss: (code: string) => string
  renderMarkdown: (
    content: string,
    highlightVariables?: boolean,
    options?: RenderMarkdownOptions,
  ) => string
  createMarkdownIt: (
    enableMath?: boolean,
    linkGithubReferences?: boolean,
    mathRenderer?: (content: string, displayMode: boolean) => string,
  ) => MarkdownItLike
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

export function highlightCss(code: string): string {
  const vendor = getMarkdownVendor()
  if (typeof vendor.highlightCss !== "function") {
    throw new Error("[Ophel] Markdown vendor highlightCss is missing")
  }
  return vendor.highlightCss(code)
}

/**
 * 创建 markdown-it 实例（用于 HTML 导出等场景）
 * 数学公式渲染器必须显式传入：油猴端传 ~platform/userscript/katex 的 MathML 实现
 */
export const createMarkdownIt = (
  enableMath = false,
  linkGithubReferences = false,
  mathRenderer?: (content: string, displayMode: boolean) => string,
): MarkdownItLike => {
  const vendor = getMarkdownVendor()
  if (typeof vendor.createMarkdownIt !== "function") {
    throw new Error("[Ophel] Markdown vendor createMarkdownIt is missing")
  }
  return vendor.createMarkdownIt(enableMath, linkGithubReferences, mathRenderer)
}

export const getHighlightStyles = (): string => {
  if (typeof window === "undefined") return ""
  return window.__OPHEL_MARKDOWN_PREVIEW_STYLES__ || ""
}

export { enhanceReleaseNotesHtml } from "~utils/release-notes-enhancer"
