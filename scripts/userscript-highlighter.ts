import ts from "typescript"

// 只在油猴构建里改写编辑器依赖；共享组件继续为扩展打包本地高亮库。
export function rewriteUserscriptCssHighlighter(code: string): string {
  const source = ts.createSourceFile(
    "editor.tsx",
    code,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  )
  let imports = 0
  let registrations = 0
  let calls = 0
  const result = ts.transform(source, [
    (context) => {
      const visit: ts.Visitor = (node) => {
        if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
          if (node.moduleSpecifier.text === "highlight.js/lib/languages/css") {
            imports++
            return undefined
          }
          if (node.moduleSpecifier.text === "highlight.js/lib/core") {
            imports++
            return ts.factory.createImportDeclaration(
              undefined,
              ts.factory.createImportClause(
                false,
                undefined,
                ts.factory.createNamedImports([
                  ts.factory.createImportSpecifier(
                    false,
                    undefined,
                    ts.factory.createIdentifier("highlightCss"),
                  ),
                ]),
              ),
              ts.factory.createStringLiteral("~platform/userscript/markdown-global"),
            )
          }
        }
        if (
          ts.isExpressionStatement(node) &&
          ts.isCallExpression(node.expression) &&
          node.expression.expression.getText(source) === "hljs.registerLanguage"
        ) {
          registrations++
          return undefined
        }
        if (
          ts.isPropertyAccessExpression(node) &&
          node.name.text === "value" &&
          ts.isCallExpression(node.expression) &&
          node.expression.expression.getText(source) === "hljs.highlight"
        ) {
          calls++
          return ts.factory.createCallExpression(
            ts.factory.createIdentifier("highlightCss"),
            undefined,
            [node.expression.arguments[0]],
          )
        }
        return ts.visitEachChild(node, visit, context)
      }
      return (node) => ts.visitNode(node, visit) as ts.SourceFile
    },
  ])
  try {
    if (imports !== 2 || registrations !== 1 || calls !== 1) {
      throw new Error("Userscript CSS highlighter extraction no longer matches the editor source")
    }
    return ts.createPrinter().printFile(result.transformed[0])
  } finally {
    result.dispose()
  }
}
