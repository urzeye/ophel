import fs from "node:fs"
import path from "node:path"
import { createHash } from "node:crypto"
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
  "src/components/ui/Tooltip.tsx",
  "src/core/copy-manager.ts",
  "src/core/inline-bookmark-manager.ts",
  "src/core/watermark-remover.ts",
  "src/styles/conversation-sync-review-inline.ts",
  "src/styles/export-document-inline.ts",
  "src/styles/image-export-inline.ts",
  "src/styles/native-theme-adapters/chatgpt.ts",
  "src/styles/user-query-markdown-inline.ts",
  "src/tabs/options/components/CustomStyleEditorDialog.tsx",
  "src/utils/exporter.ts",
] as const

export const USERSCRIPT_HOST_STYLE_SOURCES = [
  "src/styles/conversations.css",
  "src/styles/queue-overlay.css",
] as const

export function findUserscriptStaticStyles(code: string) {
  const source = ts.createSourceFile(
    "styles.tsx",
    code,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  )
  const styles: { start: number; end: number; text: string; key: string }[] = []
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
  return styles
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
        return (
          `import { readUserscriptResourceText } from ${JSON.stringify(loader)};\n` +
          `GM_addStyle(readUserscriptResourceText(${JSON.stringify(USERSCRIPT_RESOURCE_DEFINITIONS.hostStyles.metaName)}));`
        )
      },
      transform(code, id) {
        if (!files.has(id.replace(/\\/g, "/"))) return
        const styles = findUserscriptStaticStyles(code)
        if (!styles.length) throw new Error(`Userscript styles changed during build: ${id}`)
        for (const style of styles.reverse()) {
          if (texts[style.key] !== style.text) throw new Error(`Unknown userscript style in ${id}`)
          code =
            code.slice(0, style.start) +
            `readUserscriptInlineStyle(${JSON.stringify(style.key)})` +
            code.slice(style.end)
        }
        return `import { readUserscriptInlineStyle } from ${JSON.stringify(loader)};\n${code}`
      },
    },
  }
}
