import fs from "node:fs"
import path from "node:path"
import ts from "typescript"
import type { Plugin } from "vite"

import { USERSCRIPT_RESOURCE_DEFINITIONS } from "../src/platform/userscript/resource-manifest"

function findStyleTemplate(code: string) {
  const source = ts.createSourceFile(
    "appearance.tsx",
    code,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  )
  let template: ts.StringLiteral | ts.NoSubstitutionTemplateLiteral | undefined
  const visit = (node: ts.Node) => {
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.name.text === "CSS_TEMPLATE" &&
      node.initializer &&
      (ts.isStringLiteral(node.initializer) || ts.isNoSubstitutionTemplateLiteral(node.initializer))
    ) {
      template = node.initializer
    }
    ts.forEachChild(node, visit)
  }
  visit(source)
  if (!template) throw new Error("Userscript custom-style template must be a static string")
  return { start: template.getStart(source), end: template.end, text: template.text }
}

export function createUserscriptStyleTemplate(root: string): { content: string; plugin: Plugin } {
  const file = path.resolve(root, "src/tabs/options/pages/AppearancePage.tsx")
  const template = findStyleTemplate(fs.readFileSync(file, "utf8"))
  const loader = path.resolve(root, "src/platform/userscript/text-resources.ts")
  return {
    content: template.text,
    plugin: {
      name: "ophel-userscript-style-template",
      enforce: "pre",
      transform(code, id) {
        if (id !== file && id !== file.replace(/\\/g, "/")) return
        const current = findStyleTemplate(code)
        if (current.text !== template.text)
          throw new Error("Userscript style template changed during build")
        const replacement = `readUserscriptResourceText(${JSON.stringify(USERSCRIPT_RESOURCE_DEFINITIONS.customStyleTemplate.metaName)})`
        return (
          `import { readUserscriptResourceText } from ${JSON.stringify(loader)};\n` +
          code.slice(0, current.start) +
          replacement +
          code.slice(current.end)
        )
      },
    },
  }
}
