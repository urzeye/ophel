import { USERSCRIPT_RESOURCE_DEFINITIONS } from "./resource-manifest"

declare function GM_getResourceText(name: string): string

export function readUserscriptResourceText(name: string): string {
  const text = GM_getResourceText(name)
  if (typeof text !== "string" || text.length === 0) {
    throw new Error(`[Ophel] Required text resource is missing: ${name}`)
  }
  return text
}

let inlineStyles: Record<string, unknown> | undefined

export function readUserscriptInlineStyle(key: string): string {
  if (!inlineStyles) {
    const name = USERSCRIPT_RESOURCE_DEFINITIONS.inlineStyles.metaName
    const data: unknown = JSON.parse(readUserscriptResourceText(name))
    if (!data || typeof data !== "object" || Array.isArray(data)) {
      throw new Error(`[Ophel] Invalid inline styles resource: ${name}`)
    }
    inlineStyles = data as Record<string, unknown>
  }
  const style = inlineStyles[key]
  if (typeof style !== "string" || style.length === 0) {
    throw new Error(`[Ophel] Required inline style is missing: ${key}`)
  }
  return style
}
