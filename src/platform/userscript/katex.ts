import {
  renderKatexFallbackMathML,
  renderKatexFallbackString,
  wrapKatexResult,
  type KatexRenderOptions,
} from "../katex-registry"
import { KATEX_CDN_FONT_BASE_URL, KATEX_CSS_RESOURCE_NAME } from "./katex-cdn"

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
    return renderKatexFallbackString(latex, { displayMode })
  }

  try {
    const rendered = katex.renderToString(latex, {
      displayMode,
      output: "htmlAndMathml",
      throwOnError: false,
      strict: "ignore",
      trust: false,
    })
    return wrapKatexResult(latex, rendered, displayMode)
  } catch {
    return renderKatexFallbackString(latex, { displayMode })
  }
}

/**
 * 渲染为纯 MathML（无字体依赖，适合自包含的导出文档）
 */
export const renderKatexToMathML = (
  content: string,
  { displayMode }: KatexRenderOptions,
): string => {
  const latex = content.replace(/\r\n?/g, "\n").trim()
  const katex = getGlobalKatex()

  if (!katex) {
    return renderKatexFallbackMathML(latex, { displayMode })
  }

  try {
    const rendered = katex.renderToString(latex, {
      displayMode,
      output: "mathml",
      throwOnError: false,
      strict: "ignore",
      trust: false,
    })
    return wrapKatexResult(latex, rendered, displayMode)
  } catch {
    return renderKatexFallbackMathML(latex, { displayMode })
  }
}
