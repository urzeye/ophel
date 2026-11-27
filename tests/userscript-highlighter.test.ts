import fs from "node:fs"
import vm from "node:vm"
import hljs from "highlight.js/lib/core"
import css from "highlight.js/lib/languages/css"
import { describe, expect, it } from "vitest"

import { rewriteUserscriptCssHighlighter } from "../scripts/userscript-highlighter"

describe("userscript CSS highlighter", () => {
  it("rewrites the shared editor without changing its extension source", () => {
    const original = fs.readFileSync(
      "src/tabs/options/components/CustomStyleEditorDialog.tsx",
      "utf8",
    )
    const transformed = rewriteUserscriptCssHighlighter(original)
    expect(original).toContain('import hljs from "highlight.js/lib/core"')
    expect(transformed).not.toContain("highlight.js/")
    expect(transformed).not.toContain("hljs.")
    expect(transformed).toContain("highlightCss(code)")
    expect(() => rewriteUserscriptCssHighlighter("export const changed = true")).toThrow()
  })

  it("matches local highlighting through the real built vendor", () => {
    const context = vm.createContext({ console })
    const manifest = JSON.parse(
      fs.readFileSync("build/userscript/userscript-assets/manifest.json", "utf8"),
    )
    const file = `build/userscript/${manifest.requires.markdownVendor.relativePath}`
    vm.runInContext(fs.readFileSync(file, "utf8"), context)
    hljs.registerLanguage("css", css)
    const code = ":host { --gh-bg: #fff; animation: fade 1s; } /* <script> & */"
    const actual = context.__OphelMarkdownVendor.highlightCss(code)
    expect(actual).toBe(hljs.highlight(code, { language: "css" }).value)
  })
})
