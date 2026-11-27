import fs from "node:fs"
import path from "node:path"
import vm from "node:vm"
import ts from "typescript"
import { afterEach, describe, expect, it, vi } from "vitest"

import { createUserscriptStyleTemplate } from "../scripts/userscript-text-resources"
import { readUserscriptResourceText } from "../src/platform/userscript/text-resources"

afterEach(() => vi.unstubAllGlobals())

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
