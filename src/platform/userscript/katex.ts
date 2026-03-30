import { KATEX_CDN_FONT_BASE_URL, KATEX_CSS_RESOURCE_NAME } from "./katex-cdn"

type KatexRenderOptions = {
  displayMode: boolean
}

type KatexLike = {
  renderToString: (
    content: string,
    options?: {
      displayMode?: boolean
      output?: "html" | "mathml" | "htmlAndMathml"
      throwOnError?: boolean
      strict?: "warn" | "ignore" | "error"
      trust?: boolean
    },
  ) => string
}

const escapeHtml = (value: string): string =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")

const getGlobalKatex = (): KatexLike | null => {
  const katex = (globalThis as typeof globalThis & { katex?: KatexLike }).katex
  return katex && typeof katex.renderToString === "function" ? katex : null
}

const rewriteKatexFontUrls = (cssText: string): string =>
  cssText.replace(/url\((['"]?)(?!data:|https?:|\/)([^)'"]+)\1\)/g, (_match, quote, assetPath) => {
    const normalizedPath = String(assetPath).replace(/^\.?\//, "")
    const absoluteUrl = normalizedPath.startsWith("fonts/")
      ? `${KATEX_CDN_FONT_BASE_URL}/${normalizedPath.slice("fonts/".length)}`
      : `${KATEX_CDN_FONT_BASE_URL}/${normalizedPath}`

    return `url(${quote}${absoluteUrl}${quote})`
  })

export const getKatexStylesText = (): string => {
  try {
    const cssText = GM_getResourceText(KATEX_CSS_RESOURCE_NAME)
    return cssText ? rewriteKatexFontUrls(cssText) : ""
  } catch (error) {
    console.warn("[Ophel] Failed to load KaTeX CSS resource:", error)
    return ""
  }
}

export const renderKatexToString = (
  content: string,
  { displayMode }: KatexRenderOptions,
): string => {
  const latex = content.replace(/\r\n?/g, "\n").trim()
  const katex = getGlobalKatex()

  if (!katex) {
    const fallback = displayMode ? `$$\n${latex}\n$$` : `$${latex}$`
    const tagName = displayMode ? "div" : "span"
    const className = displayMode ? "math-block gh-rendered-math" : "math-inline gh-rendered-math"
    return `<${tagName} class="${className}" data-math="${escapeHtml(latex)}"><code>${escapeHtml(fallback)}</code></${tagName}>`
  }

  try {
    const rendered = katex.renderToString(latex, {
      displayMode,
      output: "htmlAndMathml",
      throwOnError: false,
      strict: "ignore",
      trust: false,
    })
    const tagName = displayMode ? "div" : "span"
    const className = displayMode ? "math-block gh-rendered-math" : "math-inline gh-rendered-math"

    return `<${tagName} class="${className}" data-math="${escapeHtml(latex)}">${rendered}</${tagName}>`
  } catch {
    const fallback = displayMode ? `$$\n${latex}\n$$` : `$${latex}$`
    const tagName = displayMode ? "div" : "span"
    const className = displayMode ? "math-block gh-rendered-math" : "math-inline gh-rendered-math"

    return `<${tagName} class="${className}" data-math="${escapeHtml(latex)}"><code>${escapeHtml(fallback)}</code></${tagName}>`
  }
}
