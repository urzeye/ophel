import katex from "katex"
import katexStylesText from "raw:katex/dist/katex.min.css"
import katexAmsRegularWoff2Url from "url:katex/dist/fonts/KaTeX_AMS-Regular.woff2"
import katexCaligraphicBoldWoff2Url from "url:katex/dist/fonts/KaTeX_Caligraphic-Bold.woff2"
import katexCaligraphicRegularWoff2Url from "url:katex/dist/fonts/KaTeX_Caligraphic-Regular.woff2"
import katexFrakturBoldWoff2Url from "url:katex/dist/fonts/KaTeX_Fraktur-Bold.woff2"
import katexFrakturRegularWoff2Url from "url:katex/dist/fonts/KaTeX_Fraktur-Regular.woff2"
import katexMainBoldWoff2Url from "url:katex/dist/fonts/KaTeX_Main-Bold.woff2"
import katexMainBoldItalicWoff2Url from "url:katex/dist/fonts/KaTeX_Main-BoldItalic.woff2"
import katexMainItalicWoff2Url from "url:katex/dist/fonts/KaTeX_Main-Italic.woff2"
import katexMainRegularWoff2Url from "url:katex/dist/fonts/KaTeX_Main-Regular.woff2"
import katexMathBoldItalicWoff2Url from "url:katex/dist/fonts/KaTeX_Math-BoldItalic.woff2"
import katexMathItalicWoff2Url from "url:katex/dist/fonts/KaTeX_Math-Italic.woff2"
import katexSansSerifBoldWoff2Url from "url:katex/dist/fonts/KaTeX_SansSerif-Bold.woff2"
import katexSansSerifItalicWoff2Url from "url:katex/dist/fonts/KaTeX_SansSerif-Italic.woff2"
import katexSansSerifRegularWoff2Url from "url:katex/dist/fonts/KaTeX_SansSerif-Regular.woff2"
import katexScriptRegularWoff2Url from "url:katex/dist/fonts/KaTeX_Script-Regular.woff2"
import katexSize1RegularWoff2Url from "url:katex/dist/fonts/KaTeX_Size1-Regular.woff2"
import katexSize2RegularWoff2Url from "url:katex/dist/fonts/KaTeX_Size2-Regular.woff2"
import katexSize3RegularWoff2Url from "url:katex/dist/fonts/KaTeX_Size3-Regular.woff2"
import katexSize4RegularWoff2Url from "url:katex/dist/fonts/KaTeX_Size4-Regular.woff2"
import katexTypewriterRegularWoff2Url from "url:katex/dist/fonts/KaTeX_Typewriter-Regular.woff2"

export type KatexRenderOptions = {
  displayMode: boolean
}

type ExtensionRuntimeLike = {
  getURL: (path: string) => string
}

type ExtensionApiLike = {
  runtime?: ExtensionRuntimeLike
}

const KATEX_WOFF2_ASSET_URLS: Record<string, string> = {
  "fonts/KaTeX_AMS-Regular.woff2": katexAmsRegularWoff2Url,
  "fonts/KaTeX_Caligraphic-Bold.woff2": katexCaligraphicBoldWoff2Url,
  "fonts/KaTeX_Caligraphic-Regular.woff2": katexCaligraphicRegularWoff2Url,
  "fonts/KaTeX_Fraktur-Bold.woff2": katexFrakturBoldWoff2Url,
  "fonts/KaTeX_Fraktur-Regular.woff2": katexFrakturRegularWoff2Url,
  "fonts/KaTeX_Main-Bold.woff2": katexMainBoldWoff2Url,
  "fonts/KaTeX_Main-BoldItalic.woff2": katexMainBoldItalicWoff2Url,
  "fonts/KaTeX_Main-Italic.woff2": katexMainItalicWoff2Url,
  "fonts/KaTeX_Main-Regular.woff2": katexMainRegularWoff2Url,
  "fonts/KaTeX_Math-BoldItalic.woff2": katexMathBoldItalicWoff2Url,
  "fonts/KaTeX_Math-Italic.woff2": katexMathItalicWoff2Url,
  "fonts/KaTeX_SansSerif-Bold.woff2": katexSansSerifBoldWoff2Url,
  "fonts/KaTeX_SansSerif-Italic.woff2": katexSansSerifItalicWoff2Url,
  "fonts/KaTeX_SansSerif-Regular.woff2": katexSansSerifRegularWoff2Url,
  "fonts/KaTeX_Script-Regular.woff2": katexScriptRegularWoff2Url,
  "fonts/KaTeX_Size1-Regular.woff2": katexSize1RegularWoff2Url,
  "fonts/KaTeX_Size2-Regular.woff2": katexSize2RegularWoff2Url,
  "fonts/KaTeX_Size3-Regular.woff2": katexSize3RegularWoff2Url,
  "fonts/KaTeX_Size4-Regular.woff2": katexSize4RegularWoff2Url,
  "fonts/KaTeX_Typewriter-Regular.woff2": katexTypewriterRegularWoff2Url,
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

const stripKatexLegacyFontFormats = (cssText: string): string =>
  cssText.replace(
    /,url\((['"]?)fonts\/[^)'"]+\.woff\1\) format\("woff"\),url\((['"]?)fonts\/[^)'"]+\.ttf\2\) format\("truetype"\)/g,
    "",
  )

const toExtensionAssetUrl = (assetPath: string): string => {
  if (/^(?:data:|https?:|chrome-extension:|moz-extension:|\/)/.test(assetPath)) {
    return assetPath
  }

  const normalizedPath = assetPath.replace(/^\.?\//, "")
  const getUrl = getExtensionGetUrl()

  return getUrl ? getUrl(normalizedPath) : assetPath
}

const rewriteKatexAssetUrls = (cssText: string): string => {
  return cssText.replace(/url\((['"]?)(fonts\/[^)'"]+\.woff2)\1\)/g, (_match, quote, assetPath) => {
    const resolvedAssetUrl = KATEX_WOFF2_ASSET_URLS[String(assetPath)]
    if (!resolvedAssetUrl) {
      return _match
    }

    return `url(${quote}${toExtensionAssetUrl(resolvedAssetUrl)}${quote})`
  })
}

export const getKatexStylesText = (): string =>
  rewriteKatexAssetUrls(stripKatexLegacyFontFormats(katexStylesText))

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
