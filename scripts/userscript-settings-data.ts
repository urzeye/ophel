import fs from "node:fs"
import path from "node:path"
import vm from "node:vm"
import ts from "typescript"
import type { Plugin } from "vite"

import { SHORTCUT_META } from "../src/constants/shortcuts"

const DATA_FIELDS = {
  SETTING_ID_ROUTE_MAP: { key: "routes", helper: "createLazyUserscriptSettingsRecord" },
  SETTING_ID_ROUTE_RULES: { key: "prefixRoutes", helper: "createLazyUserscriptSettingsArray" },
  SETTING_ID_ALIASES: { key: "aliases", helper: "createLazyUserscriptSettingsRecord" },
  LEGACY_SETTINGS_PAGE_REDIRECTS: {
    key: "legacyRoutes",
    helper: "createLazyUserscriptSettingsRecord",
  },
  SETTINGS_SEARCH_ITEMS: { key: "items", helper: "createLazyUserscriptSettingsArray" },
  SETTING_CARD_LEVEL_SEARCH_IDS: { key: "cardIds", helper: "createLazyUserscriptSettingsSet" },
} as const

const SEARCH_ITEM_GROUPS = new Set([
  "SHORTCUT_SETTINGS_SEARCH_ITEMS",
  "PAGE_TAB_SETTINGS_SEARCH_ITEMS",
  "SUB_TAB_SETTINGS_SEARCH_ITEMS",
  "SETTING_CARD_SEARCH_ITEMS",
  "ADDITIONAL_SETTING_SEARCH_ITEMS",
])

// 只编译选定数据及其常量依赖，不加载 UI 模块、组件或应用路径别名。
function serializeSettingsData(source: ts.SourceFile): string {
  const declarations = new Map<string, ts.VariableStatement>()
  for (const statement of source.statements) {
    if (!ts.isVariableStatement(statement) || statement.declarationList.declarations.length !== 1)
      continue
    const declaration = statement.declarationList.declarations[0]
    if (ts.isIdentifier(declaration.name)) declarations.set(declaration.name.text, statement)
  }
  const needed = new Set<string>(Object.keys(DATA_FIELDS))
  const collect = (node: ts.Node) => {
    if (ts.isIdentifier(node) && declarations.has(node.text)) needed.add(node.text)
    ts.forEachChild(node, collect)
  }
  for (const name of needed) {
    const declaration = declarations.get(name)?.declarationList.declarations[0]
    if (!declaration?.initializer) throw new Error(`Missing settings data initializer: ${name}`)
    collect(declaration.initializer)
  }
  const code =
    Array.from(declarations)
      .filter(([name]) => needed.has(name))
      .map(([, statement]) => statement.getText(source))
      .join("\n") + `\nexport { ${Object.keys(DATA_FIELDS).join(", ")} }`
  const output = ts.transpileModule(code, {
    compilerOptions: { module: ts.ModuleKind.CommonJS },
  }).outputText
  const module = { exports: {} as Record<string, unknown> }
  vm.runInNewContext(
    output,
    { module, exports: module.exports, SHORTCUT_META },
    { filename: source.fileName },
  )
  const data = Object.fromEntries(
    Object.entries(DATA_FIELDS).map(([name, { key }]) => [
      key,
      key === "cardIds"
        ? Array.from(module.exports[name] as Iterable<string>)
        : module.exports[name],
    ]),
  )
  return JSON.stringify(data, (_key, value) => {
    if (value === undefined || typeof value === "function" || typeof value === "symbol") {
      throw new Error("Userscript settings resources must contain only JSON data")
    }
    return value
  })
}

export function createUserscriptSettingsData(root: string): { content: string; plugin: Plugin } {
  const file = path.resolve(root, "src/constants/ui.ts")
  const original = fs.readFileSync(file, "utf8")
  const source = ts.createSourceFile(file, original, ts.ScriptTarget.Latest, true)
  const loader = path.resolve(root, "src/platform/userscript/settings-data.ts")
  return {
    content: serializeSettingsData(source),
    plugin: {
      name: "ophel-userscript-settings-data",
      enforce: "pre",
      transform(code, id) {
        if (id !== file && id !== file.replace(/\\/g, "/")) return
        if (code !== original) throw new Error("Settings data changed before userscript extraction")
        const edits: { start: number; end: number; text: string }[] = []
        const replaced = new Set<string>()
        const removed = new Set<string>()
        const visit = (node: ts.Node) => {
          if (ts.isVariableStatement(node) && node.declarationList.declarations.length === 1) {
            const declaration = node.declarationList.declarations[0]
            if (
              ts.isIdentifier(declaration.name) &&
              SEARCH_ITEM_GROUPS.has(declaration.name.text)
            ) {
              if (
                node.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword)
              ) {
                throw new Error(`Search data group is now public: ${declaration.name.text}`)
              }
              removed.add(declaration.name.text)
              edits.push({ start: node.getStart(source), end: node.end, text: "" })
              return
            }
          }
          if (
            ts.isVariableDeclaration(node) &&
            ts.isIdentifier(node.name) &&
            node.initializer &&
            Object.prototype.hasOwnProperty.call(DATA_FIELDS, node.name.text)
          ) {
            const name = node.name.text as keyof typeof DATA_FIELDS
            const { key, helper } = DATA_FIELDS[name]
            if (
              name === "SETTING_CARD_LEVEL_SEARCH_IDS" &&
              (!ts.isNewExpression(node.initializer) ||
                node.initializer.expression.getText(source) !== "Set")
            ) {
              throw new Error("Settings card IDs must retain Set semantics")
            }
            replaced.add(name)
            edits.push({
              start: node.initializer.getStart(source),
              end: node.initializer.end,
              text: `${helper}(${JSON.stringify(key)})`,
            })
            return
          }
          ts.forEachChild(node, visit)
        }
        visit(source)
        if (
          replaced.size !== Object.keys(DATA_FIELDS).length ||
          removed.size !== SEARCH_ITEM_GROUPS.size
        ) {
          throw new Error("Userscript settings extraction no longer matches the source")
        }
        for (const edit of edits.sort((a, b) => b.start - a.start)) {
          code = code.slice(0, edit.start) + edit.text + code.slice(edit.end)
        }
        return `import { createLazyUserscriptSettingsArray, createLazyUserscriptSettingsRecord, createLazyUserscriptSettingsSet } from ${JSON.stringify(loader)};\n${code}`
      },
    },
  }
}
