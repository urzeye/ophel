import { createHash } from "node:crypto"
import fs from "node:fs"
import path from "node:path"
import ts from "typescript"
import type { Plugin } from "vite"

export function getUserscriptSvgSourceFiles(root: string): string[] {
  return [
    ...ts.sys.readDirectory(path.resolve(root, "src/components"), [".tsx"], undefined, [
      "**/*.tsx",
    ]),
    path.resolve(root, "src/core/assistant-mermaid-renderer.ts"),
  ]
    .map((file) => file.replace(/\\/g, "/"))
    .sort()
}

export function findUserscriptSvgPaths(code: string, file: string) {
  const source = ts.createSourceFile(file, code, ts.ScriptTarget.Latest, true)
  const paths: { start: number; end: number; text: string; key: string; jsx: boolean }[] = []
  const visit = (node: ts.Node) => {
    if (
      ts.isStringLiteral(node) &&
      node.text.length >= 100 &&
      /^[Mm]\s*-?\d/.test(node.text) &&
      /^[Mm\d\s.,+eEzZlLhHvVcCsSqQtTaA-]+$/.test(node.text)
    ) {
      paths.push({
        start: node.getStart(source),
        end: node.end,
        text: node.text,
        key: createHash("sha256").update(node.text).digest("hex").slice(0, 12),
        jsx: ts.isJsxAttribute(node.parent),
      })
    }
    ts.forEachChild(node, visit)
  }
  visit(source)
  return paths
}

export function createUserscriptSvgPaths(root: string): { content: string; plugin: Plugin } {
  const paths: Record<string, string> = {}
  const files = new Set<string>()
  for (const file of getUserscriptSvgSourceFiles(root)) {
    const found = findUserscriptSvgPaths(fs.readFileSync(file, "utf8"), file)
    if (!found.length) continue
    files.add(file)
    for (const { key, text } of found) {
      if (key in paths && paths[key] !== text) throw new Error(`SVG path key collision: ${key}`)
      paths[key] = text
    }
  }
  if (!files.size) throw new Error("No userscript SVG paths found")
  const loader = path.resolve(root, "src/platform/userscript/text-resources.ts")
  return {
    content: JSON.stringify(paths),
    plugin: {
      name: "ophel-userscript-svg-paths",
      enforce: "pre",
      transform(code, id) {
        if (!files.has(id.replace(/\\/g, "/"))) return
        const found = findUserscriptSvgPaths(code, id)
        if (!found.length) throw new Error(`SVG paths changed during build: ${id}`)
        for (const item of found.reverse()) {
          if (paths[item.key] !== item.text) throw new Error(`Unknown SVG path in ${id}`)
          const read = `readUserscriptSvgPath(${JSON.stringify(item.key)})`
          code = code.slice(0, item.start) + (item.jsx ? `{${read}}` : read) + code.slice(item.end)
        }
        return `import { readUserscriptSvgPath } from ${JSON.stringify(loader)};\n${code}`
      },
    },
  }
}
