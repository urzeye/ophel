import katex from "katex"
import katexStylesText from "data-text:katex/dist/katex.min.css"

export type KatexRenderOptions = {
  displayMode: boolean
}

type ExtensionRuntimeLike = {
  getURL: (path: string) => string
}

type ExtensionApiLike = {
  runtime?: ExtensionRuntimeLike
}

const escapeHtml = (value: string): string =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")

const getExtensionGetUrl = (): ((path: string) => string) | null => {
  const extensionApi =
    (
      globalThis as typeof globalThis & {
        chrome?: ExtensionApiLike
        browser?: ExtensionApiLike
      }
    ).chrome ??
    (
      globalThis as typeof globalThis & {
        chrome?: ExtensionApiLike
        browser?: ExtensionApiLike
      }
    ).browser

  if (!extensionApi?.runtime || typeof extensionApi.runtime.getURL !== "function") {
    return null
  }

  return extensionApi.runtime.getURL.bind(extensionApi.runtime)
}

const rewriteKatexAssetUrls = (cssText: string): string => {
  const getUrl = getExtensionGetUrl()
  if (!getUrl) {
    return cssText
  }

  return cssText.replace(
    /url\((['"]?)(?!data:|https?:|chrome-extension:|moz-extension:|\/)([^)'"]+)\1\)/g,
    (_match, quote, assetPath) => {
      const normalizedPath = String(assetPath).replace(/^\.?\//, "")
      const runtimePath = normalizedPath.startsWith("fonts/")
        ? normalizedPath.slice("fonts/".length)
        : normalizedPath
      return `url(${quote}${getUrl(runtimePath)}${quote})`
    },
  )
}

export const getKatexStylesText = (): string => rewriteKatexAssetUrls(katexStylesText)

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
