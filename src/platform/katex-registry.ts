/**
 * KaTeX 渲染实现注册表（零依赖模块）
 *
 * katex npm 包约 250KB，platform 桶若顶层静态引用会进入每个包含
 * platform 的 bundle（含从不渲染公式的 popup/options）。改为注册表
 * 注入：需要真实渲染的入口显式引入完成自注册——main（复制/导出/
 * 用户消息公式渲染，引入 ~platform/katex-render 与 ~platform/katex）
 * 与 ui-entry（面板导出 HTML 的公式 MathML，仅引入 ~platform/katex-render）；
 * 其余入口未注册时 platform.math 走与油猴端一致的兜底输出
 * （原始 LaTeX 包裹展示），不抛错、不阻塞渲染。
 *
 * 本模块不允许 import katex 或任何带副作用的依赖。
 */

export type KatexRenderOptions = {
  displayMode: boolean
}

export interface KatexRenderer {
  renderKatexToString(content: string, options: KatexRenderOptions): string
  renderKatexToMathML(content: string, options: KatexRenderOptions): string
}

export type KatexStylesProvider = () => string

export const escapeHtml = (value: string): string =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")

export const wrapKatexResult = (latex: string, rendered: string, displayMode: boolean): string => {
  const className = displayMode ? "math-block gh-rendered-math" : "math-inline gh-rendered-math"
  const tagName = displayMode ? "div" : "span"

  return `<${tagName} class="${className}" data-math="${escapeHtml(latex)}">${rendered}</${tagName}>`
}

const normalizeLatex = (content: string): string => content.replace(/\r\n?/g, "\n").trim()

/** 与油猴端 katex 缺失时的兜底输出保持一致：展示原始 LaTeX */
export const renderKatexFallbackString = (
  content: string,
  { displayMode }: KatexRenderOptions,
): string => {
  const latex = normalizeLatex(content)
  const fallback = displayMode ? `$$\n${latex}\n$$` : `$${latex}$`
  return wrapKatexResult(latex, `<code>${escapeHtml(fallback)}</code>`, displayMode)
}

export const renderKatexFallbackMathML = (
  content: string,
  { displayMode }: KatexRenderOptions,
): string => {
  const latex = normalizeLatex(content)
  return wrapKatexResult(latex, `<math><mtext>${escapeHtml(latex)}</mtext></math>`, displayMode)
}

let renderer: KatexRenderer | null = null
let stylesProvider: KatexStylesProvider | null = null

export const registerKatexRenderer = (impl: KatexRenderer): void => {
  renderer = impl
}

export const getKatexRenderer = (): KatexRenderer | null => renderer

export const registerKatexStylesProvider = (provider: KatexStylesProvider): void => {
  stylesProvider = provider
}

export const getKatexStylesProvider = (): KatexStylesProvider | null => stylesProvider
