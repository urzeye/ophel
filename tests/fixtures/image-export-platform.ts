import { renderKatexToMathML, renderKatexToString } from "../../src/platform/katex-render"

// 烟测使用真实公式渲染器和网络，仅替代扩展 background 传输。
export const platform = {
  math: { renderKatexToMathML, renderKatexToString },
  fetch: (url: string) => fetch(url),
}
