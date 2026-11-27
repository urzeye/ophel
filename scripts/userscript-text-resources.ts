import fs from "node:fs"
import path from "node:path"
import { createHash } from "node:crypto"
import ts from "typescript"
import type { Plugin } from "vite"

import { USERSCRIPT_RESOURCE_DEFINITIONS } from "../src/platform/userscript/resource-manifest"

interface TextEdit {
  start: number
  end: number
  text: string
}

function applyTextEdits(code: string, edits: TextEdit[]): string {
  const sorted = [...edits].sort((a, b) => b.start - a.start)
  for (let index = 1; index < sorted.length; index += 1) {
    if (sorted[index].end > sorted[index - 1].start) {
      throw new Error("Overlapping text edits during userscript resource extraction")
    }
  }
  for (const edit of sorted) {
    code = code.slice(0, edit.start) + edit.text + code.slice(edit.end)
  }
  return code
}

function isInsideFunction(node: ts.Node): boolean {
  let current: ts.Node | undefined = node.parent
  while (current) {
    if (ts.isFunctionLike(current)) return true
    current = current.parent
  }
  return false
}

function isExportedStatement(statement: ts.Statement): boolean {
  return Boolean(
    ts.canHaveModifiers(statement) &&
      ts.getModifiers(statement)?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword),
  )
}

function isNonValueIdentifier(node: ts.Identifier): boolean {
  const parent = node.parent
  if (ts.isPropertyAccessExpression(parent) && parent.name === node) return true
  if (ts.isPropertyAssignment(parent) && parent.name === node) return true
  if (ts.isMethodDeclaration(parent) && parent.name === node) return true
  if (ts.isGetAccessorDeclaration(parent) && parent.name === node) return true
  if (ts.isSetAccessorDeclaration(parent) && parent.name === node) return true
  if (ts.isPropertyDeclaration(parent) && parent.name === node) return true
  if (ts.isJsxAttribute(parent) && parent.name === node) return true
  if (ts.isLabeledStatement(parent) && parent.label === node) return true
  if (ts.isBreakOrContinueStatement(parent) && parent.label === node) return true
  if (ts.isBindingElement(parent) && parent.propertyName === node) return true
  return false
}

function isBindingOrDeclarationIdentifier(node: ts.Identifier): boolean {
  const parent = node.parent
  if (ts.isVariableDeclaration(parent) && parent.name === node) return true
  if (ts.isParameter(parent) && parent.name === node) return true
  if (ts.isBindingElement(parent) && parent.name === node) return true
  if (
    (ts.isFunctionDeclaration(parent) ||
      ts.isFunctionExpression(parent) ||
      ts.isClassDeclaration(parent) ||
      ts.isClassExpression(parent)) &&
    parent.name === node
  ) {
    return true
  }
  return false
}

function isMutationTarget(node: ts.Identifier): boolean {
  const parent = node.parent
  if (
    ts.isBinaryExpression(parent) &&
    parent.left === node &&
    parent.operatorToken.kind >= ts.SyntaxKind.FirstAssignment &&
    parent.operatorToken.kind <= ts.SyntaxKind.LastAssignment
  ) {
    return true
  }
  if (
    (ts.isPrefixUnaryExpression(parent) || ts.isPostfixUnaryExpression(parent)) &&
    (parent.operator === ts.SyntaxKind.PlusPlusToken ||
      parent.operator === ts.SyntaxKind.MinusMinusToken)
  ) {
    return true
  }
  return false
}

// 将模块顶层非导出 `const NAME = <static>` 声明内联到函数内引用点，避免在非白名单站点顶层触发资源读取。
function collectLocalConstInlineEdits(
  source: ts.SourceFile,
  statement: ts.VariableStatement,
  name: string,
  replacement: string,
  fileLabel: string,
): TextEdit[] {
  if (
    statement.parent !== source ||
    statement.declarationList.declarations.length !== 1 ||
    (statement.declarationList.flags & ts.NodeFlags.Const) === 0 ||
    isExportedStatement(statement)
  ) {
    throw new Error(`Expected non-exported top-level const "${name}" in ${fileLabel}`)
  }

  const edits: TextEdit[] = [{ start: statement.getStart(source), end: statement.end, text: "" }]
  let refCount = 0

  const visit = (node: ts.Node) => {
    if (
      node === statement ||
      ts.isTypeNode(node) ||
      ts.isInterfaceDeclaration(node) ||
      ts.isTypeAliasDeclaration(node) ||
      ts.isImportDeclaration(node) ||
      ts.isExportDeclaration(node)
    ) {
      return
    }
    if (ts.isIdentifier(node) && node.text === name) {
      if (isNonValueIdentifier(node)) return
      if (isBindingOrDeclarationIdentifier(node)) {
        throw new Error(`Shadowed userscript constant "${name}" in ${fileLabel}`)
      }
      if (isMutationTarget(node)) {
        throw new Error(`Mutated userscript constant "${name}" in ${fileLabel}`)
      }
      if (!isInsideFunction(node)) {
        throw new Error(`Top-level reference to userscript constant "${name}" in ${fileLabel}`)
      }
      refCount += 1
      if (ts.isShorthandPropertyAssignment(node.parent) && node.parent.name === node) {
        edits.push({
          start: node.parent.getStart(source),
          end: node.parent.end,
          text: `${name}: ${replacement}`,
        })
      } else {
        edits.push({ start: node.getStart(source), end: node.end, text: replacement })
      }
      return
    }
    ts.forEachChild(node, visit)
  }

  visit(source)
  if (refCount === 0) {
    throw new Error(`Unused userscript constant "${name}" in ${fileLabel}`)
  }
  return edits
}

function findStyleTemplate(code: string) {
  const source = ts.createSourceFile(
    "appearance.tsx",
    code,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  )
  let match: { statement: ts.VariableStatement; text: string } | undefined
  for (const statement of source.statements) {
    if (
      !ts.isVariableStatement(statement) ||
      statement.declarationList.declarations.length !== 1 ||
      (statement.declarationList.flags & ts.NodeFlags.Const) === 0 ||
      isExportedStatement(statement)
    ) {
      continue
    }
    const declaration = statement.declarationList.declarations[0]
    if (
      ts.isIdentifier(declaration.name) &&
      declaration.name.text === "CSS_TEMPLATE" &&
      declaration.initializer &&
      (ts.isStringLiteral(declaration.initializer) ||
        ts.isNoSubstitutionTemplateLiteral(declaration.initializer))
    ) {
      match = { statement, text: declaration.initializer.text }
      break
    }
  }
  if (!match) {
    throw new Error(
      "Userscript custom-style template must be a non-exported top-level const string",
    )
  }
  return { source, ...match }
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
        const edits = collectLocalConstInlineEdits(
          current.source,
          current.statement,
          "CSS_TEMPLATE",
          replacement,
          id,
        )
        return (
          `import { readUserscriptResourceText } from ${JSON.stringify(loader)};\n` +
          applyTextEdits(code, edits)
        )
      },
    },
  }
}

// 显式限定作用范围，避免把用户文本或可执行的模板字符串当作 CSS 抽走。
export const USERSCRIPT_INLINE_STYLE_SOURCES = [
  "src/components/ChainIconPicker.tsx",
  "src/components/ConversationDialogs.tsx",
  "src/components/ConversationMenus.tsx",
  "src/components/ExportDialog.tsx",
  "src/components/LoadingOverlay.tsx",
  "src/components/PromptsTab.tsx",
  "src/components/QuickQuoteActions.tsx",
  "src/components/SegmentedExportDialog.tsx",
  "src/components/VariableInputDialog.tsx",
  "src/components/icons/MoreHorizontalIcon.tsx",
  "src/components/prompts/PromptEditorDialog.tsx",
  "src/components/prompts/PromptPreviewModal.tsx",
  "src/components/ui/Dialog.tsx",
  "src/utils/dom-tooltip.ts",
  "src/core/copy-manager.ts",
  "src/core/inline-bookmark-manager.ts",
  "src/core/watermark-remover.ts",
  "src/styles/conversation-sync-review-inline.ts",
  "src/styles/export-document-inline.ts",
  "src/styles/image-export-inline.ts",
  "src/styles/native-theme-adapters/chatgpt.ts",
  "src/tabs/options/components/CustomStyleEditorDialog.tsx",
  "src/utils/exporter.ts",
] as const

export const USERSCRIPT_HOST_STYLE_SOURCES = ["src/styles/queue-overlay.css"] as const

interface StaticStyleNode {
  node: ts.StringLiteral | ts.NoSubstitutionTemplateLiteral
  start: number
  end: number
  text: string
  key: string
}

function parseUserscriptStaticStyles(code: string): {
  source: ts.SourceFile
  styles: StaticStyleNode[]
} {
  const source = ts.createSourceFile(
    "styles.tsx",
    code,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  )
  const styles: StaticStyleNode[] = []
  const visit = (node: ts.Node) => {
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
      const text = node.text
      const selectors = text.replace(/^(?:\s|\/\*[\s\S]*?\*\/)+/, "")
      if (
        text.length >= 80 &&
        text.includes("{") &&
        /^(?:[.#:@*\[]|html\b|body\b)/.test(selectors) &&
        !text.includes("<style") &&
        !text.includes("<script")
      ) {
        styles.push({
          node,
          start: node.getStart(source),
          end: node.end,
          text,
          key: createHash("sha256").update(text).digest("hex").slice(0, 12),
        })
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(source)
  return { source, styles }
}

export function findUserscriptStaticStyles(code: string) {
  return parseUserscriptStaticStyles(code).styles.map(({ start, end, text, key }) => ({
    start,
    end,
    text,
    key,
  }))
}

export function createUserscriptInlineStyles(root: string): {
  content: string
  hostStyles: string
  plugin: Plugin
} {
  const files = new Set(
    USERSCRIPT_INLINE_STYLE_SOURCES.map((file) => path.resolve(root, file).replace(/\\/g, "/")),
  )
  const hostFiles = new Set(
    USERSCRIPT_HOST_STYLE_SOURCES.map((file) => path.resolve(root, file).replace(/\\/g, "/")),
  )
  const texts: Record<string, string> = {}
  for (const file of files) {
    const styles = findUserscriptStaticStyles(fs.readFileSync(file, "utf8"))
    if (!styles.length) throw new Error(`No static userscript styles found in ${file}`)
    for (const { key, text } of styles) {
      if (key in texts && texts[key] !== text)
        throw new Error(`Userscript style key collision: ${key}`)
      texts[key] = text
    }
  }
  const loader = path.resolve(root, "src/platform/userscript/text-resources.ts")
  const hostModule = "\0ophel-userscript-host-styles"
  return {
    content: JSON.stringify(texts),
    hostStyles: Array.from(hostFiles, (file) => fs.readFileSync(file, "utf8")).join("\n"),
    plugin: {
      name: "ophel-userscript-inline-styles",
      enforce: "pre",
      resolveId(id) {
        if (hostFiles.has(id.replace(/\\/g, "/"))) return hostModule
      },
      load(id) {
        if (id !== hostModule) return
        // 宿主样式改由 entry.tsx 在白名单校验通过后按需调用 ensureUserscriptHostStyles() 注入。
        return "export {}"
      },
      transform(code, id) {
        if (!files.has(id.replace(/\\/g, "/"))) return
        const { source, styles } = parseUserscriptStaticStyles(code)
        if (!styles.length) throw new Error(`Userscript styles changed during build: ${id}`)
        const edits: TextEdit[] = []
        for (const style of styles) {
          if (texts[style.key] !== style.text) throw new Error(`Unknown userscript style in ${id}`)
          const replacement = `readUserscriptInlineStyle(${JSON.stringify(style.key)})`
          const parent = style.node.parent
          if (
            ts.isVariableDeclaration(parent) &&
            parent.initializer === style.node &&
            ts.isIdentifier(parent.name) &&
            ts.isVariableDeclarationList(parent.parent) &&
            ts.isVariableStatement(parent.parent.parent) &&
            parent.parent.parent.parent === source
          ) {
            const statement = parent.parent.parent
            if (isExportedStatement(statement)) {
              throw new Error(
                `Exported top-level userscript style "${parent.name.text}" in ${id} must use a getter function to stay lazy`,
              )
            }
            edits.push(
              ...collectLocalConstInlineEdits(source, statement, parent.name.text, replacement, id),
            )
            continue
          }
          if (!isInsideFunction(style.node)) {
            throw new Error(`Top-level userscript inline style in ${id} must stay lazy`)
          }
          edits.push({ start: style.start, end: style.end, text: replacement })
        }
        return `import { readUserscriptInlineStyle } from ${JSON.stringify(loader)};\n${applyTextEdits(code, edits)}`
      },
    },
  }
}
