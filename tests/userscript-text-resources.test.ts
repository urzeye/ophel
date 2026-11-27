import fs from "node:fs"
import path from "node:path"
import vm from "node:vm"
import ts from "typescript"
import { afterEach, describe, expect, it, vi } from "vitest"

import {
  createUserscriptInlineStyles,
  createUserscriptStyleTemplate,
  findUserscriptStaticStyles,
  USERSCRIPT_HOST_STYLE_SOURCES,
  USERSCRIPT_INLINE_STYLE_SOURCES,
} from "../scripts/userscript-text-resources"
import { readUserscriptResourceText } from "../src/platform/userscript/text-resources"

afterEach(() => {
  vi.unstubAllGlobals()
  vi.resetModules()
})

describe("userscript custom-style template", () => {
  it("preserves the original runtime string including the complete tutorial", () => {
    const file = path.resolve("src/tabs/options/pages/AppearancePage.tsx")
    const original = fs.readFileSync(file, "utf8")
    const source = ts.createSourceFile(
      file,
      original,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TSX,
    )
    let expected: string | undefined
    const visit = (node: ts.Node) => {
      if (ts.isVariableDeclaration(node) && node.name.getText(source) === "CSS_TEMPLATE") {
        expected = vm.runInNewContext(`(${node.initializer!.getText(source)})`)
      }
      ts.forEachChild(node, visit)
    }
    visit(source)
    const resource = createUserscriptStyleTemplate(process.cwd())
    expect(resource.content).toBe(expected)
    expect(resource.content).toContain("Ophel custom style starter")
    expect(resource.content).toContain(':host([data-theme="dark"])')
    const transform = resource.plugin.transform as (code: string, id: string) => string | undefined
    const transformed = transform(original, file)
    expect(transformed).not.toContain("Ophel custom style starter")
    expect(transformed).toContain('readUserscriptResourceText("ophelCustomStyleTemplate")')
    expect(transform(original, "/unrelated.tsx")).toBeUndefined()
  })

  it("reads the manager's cached resource without changing the text", () => {
    const text = "/* keep this explanation */\n:host { --gh-bg: white; }\n"
    vi.stubGlobal("GM_getResourceText", () => text)
    expect(readUserscriptResourceText("ophelCustomStyleTemplate")).toBe(text)
  })

  it("fails explicitly when a required resource is absent", () => {
    vi.stubGlobal("GM_getResourceText", () => "")
    expect(() => readUserscriptResourceText("ophelCustomStyleTemplate")).toThrow("missing")
  })
})

describe("userscript inline styles", () => {
  it("preserves the runtime text of every extracted style and leaves interpolated styles intact", () => {
    const resource = createUserscriptInlineStyles(process.cwd())
    const styles = JSON.parse(resource.content)
    const transform = resource.plugin.transform as (code: string, id: string) => string | undefined
    let checked = 0
    for (const file of USERSCRIPT_INLINE_STYLE_SOURCES) {
      const original = fs.readFileSync(file, "utf8")
      const transformed = transform(original, path.resolve(file))!
      for (const style of findUserscriptStaticStyles(original)) {
        const expected = vm.runInNewContext(`(${original.slice(style.start, style.end)})`)
        expect(styles[style.key], file).toBe(expected)
        expect(transformed, file).toContain(`readUserscriptInlineStyle("${style.key}")`)
        checked++
      }
      const source = ts.createSourceFile(
        file,
        original,
        ts.ScriptTarget.Latest,
        true,
        ts.ScriptKind.TSX,
      )
      const visit = (node: ts.Node) => {
        if (ts.isTemplateExpression(node)) expect(transformed, file).toContain(node.getText(source))
        ts.forEachChild(node, visit)
      }
      visit(source)
    }
    expect(checked).toBeGreaterThan(25)
    expect(resource.hostStyles).toBe(
      USERSCRIPT_HOST_STYLE_SOURCES.map((file) => fs.readFileSync(file, "utf8")).join("\n"),
    )
  })

  it("caches the resource and fails explicitly for missing style keys", async () => {
    const text = ".gh-demo { color: var(--gh-text); }"
    const read = vi.fn(() => JSON.stringify({ demo: text }))
    vi.stubGlobal("GM_getResourceText", read)
    const { readUserscriptInlineStyle } = await import("../src/platform/userscript/text-resources")
    expect(readUserscriptInlineStyle("demo")).toBe(text)
    expect(readUserscriptInlineStyle("demo")).toBe(text)
    expect(read).toHaveBeenCalledExactlyOnceWith("ophelInlineStyles")
    expect(() => readUserscriptInlineStyle("absent")).toThrow("missing")
  })

  it.each(["", "{", "null", "[]", '{"demo":10}'])(
    "rejects invalid style resources: %s",
    async (text) => {
      vi.stubGlobal("GM_getResourceText", () => text)
      const { readUserscriptInlineStyle } = await import(
        "../src/platform/userscript/text-resources"
      )
      expect(() => readUserscriptInlineStyle("demo")).toThrow()
    },
  )
})
