import fs from "node:fs"
import path from "node:path"
import vm from "node:vm"
import React from "react"
import { renderToStaticMarkup } from "react-dom/server"
import ts from "typescript"
import { afterEach, describe, expect, it, vi } from "vitest"

import {
  createUserscriptSvgPaths,
  findUserscriptSvgPaths,
  getUserscriptSvgSourceFiles,
} from "../scripts/userscript-svg-paths"

afterEach(() => {
  vi.unstubAllGlobals()
  vi.resetModules()
})

describe("userscript SVG paths", () => {
  it("preserves every extracted source path and leaves short/dynamic paths in place", () => {
    const resource = createUserscriptSvgPaths(process.cwd())
    const values = JSON.parse(resource.content)
    let count = 0
    for (const file of getUserscriptSvgSourceFiles(process.cwd())) {
      const code = fs.readFileSync(file, "utf8")
      for (const found of findUserscriptSvgPaths(code, file)) {
        expect(values[found.key], file).toBe(found.text)
        count++
      }
    }
    expect(count).toBeGreaterThan(80)
    expect(findUserscriptSvgPaths('const x = <path d="M0 0 L1 1" />', "icon.tsx")).toEqual([])
    expect(findUserscriptSvgPaths("const x = <path d={`M0 0 ${value}`} />", "icon.tsx")).toEqual([])
  })

  it("renders exactly the same SVG markup with resource-backed paths", () => {
    const file = path.resolve("src/components/icons/AppearanceIcon.tsx")
    const code = fs.readFileSync(file, "utf8")
    const resource = createUserscriptSvgPaths(process.cwd())
    const values = JSON.parse(resource.content)
    const transform = resource.plugin.transform as (code: string, id: string) => string
    const transformed = transform(code, file)
    const render = (input: string) => {
      const module = { exports: {} as { AppearanceIcon: React.ComponentType } }
      const context = {
        module,
        exports: module.exports,
        require: (name: string) => {
          if (name === "react") return React
          if (name.endsWith("text-resources.ts")) {
            return { readUserscriptSvgPath: (key: string) => values[key] }
          }
          throw new Error(`Unexpected import: ${name}`)
        },
      }
      const output = ts.transpileModule(input, {
        compilerOptions: {
          module: ts.ModuleKind.CommonJS,
          jsx: ts.JsxEmit.React,
          esModuleInterop: true,
        },
      }).outputText
      vm.runInNewContext(output, context)
      return renderToStaticMarkup(React.createElement(module.exports.AppearanceIcon))
    }
    expect(render(transformed)).toBe(render(code))
    expect(transformed).toContain("d={readUserscriptSvgPath(")
  })

  it("caches resource data and reports missing entries", async () => {
    const read = vi.fn(() => JSON.stringify({ sample: "M0 0 L1 1" }))
    vi.stubGlobal("GM_getResourceText", read)
    const { readUserscriptSvgPath } = await import("../src/platform/userscript/text-resources")
    expect(readUserscriptSvgPath("sample")).toBe("M0 0 L1 1")
    expect(readUserscriptSvgPath("sample")).toBe("M0 0 L1 1")
    expect(read).toHaveBeenCalledExactlyOnceWith("ophelSvgPaths")
    expect(() => readUserscriptSvgPath("absent")).toThrow("missing")
  })

  it.each(["", "{", "null", "[]", '{"sample":10}'])(
    "rejects invalid resources: %s",
    async (text) => {
      vi.stubGlobal("GM_getResourceText", () => text)
      const { readUserscriptSvgPath } = await import("../src/platform/userscript/text-resources")
      expect(() => readUserscriptSvgPath("sample")).toThrow()
    },
  )
})
