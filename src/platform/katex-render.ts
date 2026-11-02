import katex from "katex"

import {
  registerKatexRenderer,
  renderKatexFallbackMathML,
  renderKatexFallbackString,
  wrapKatexResult,
  type KatexRenderOptions,
} from "./katex-registry"

export type { KatexRenderOptions } from "./katex-registry"

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

// 自注册：引入本模块的入口（content script main、ui-entry）使 platform.math
// 同步可用。未引入的入口（popup/options）不打包 katex，platform.math 走兜底输出。
registerKatexRenderer({ renderKatexToString, renderKatexToMathML })
