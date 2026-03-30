import katex from "katex"
import katexStylesText from "data-text:katex/dist/katex.min.css"

export type KatexRenderOptions = {
  displayMode: boolean
}

const escapeHtml = (value: string): string =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")

export const getKatexStylesText = (): string => katexStylesText

export const renderKatexToString = (
  content: string,
  { displayMode }: KatexRenderOptions,
): string => {
  const latex = content.replace(/\r\n?/g, "\n").trim()

  try {
    const rendered = katex.renderToString(latex, {
      displayMode,
      output: "htmlAndMathml",
      throwOnError: false,
      strict: "ignore",
      trust: false,
    })
    const className = displayMode ? "math-block gh-rendered-math" : "math-inline gh-rendered-math"
    const tagName = displayMode ? "div" : "span"

    return `<${tagName} class="${className}" data-math="${escapeHtml(latex)}">${rendered}</${tagName}>`
  } catch {
    const fallback = displayMode ? `$$\n${latex}\n$$` : `$${latex}$`
    const className = displayMode ? "math-block gh-rendered-math" : "math-inline gh-rendered-math"
    const tagName = displayMode ? "div" : "span"

    return `<${tagName} class="${className}" data-math="${escapeHtml(latex)}"><code>${escapeHtml(fallback)}</code></${tagName}>`
  }
}
