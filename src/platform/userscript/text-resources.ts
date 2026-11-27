import { USERSCRIPT_RESOURCE_DEFINITIONS } from "./resource-manifest"

declare function GM_getResourceText(name: string): string

export function readUserscriptResourceText(name: string): string {
  const text = GM_getResourceText(name)
  if (typeof text !== "string" || text.length === 0) {
    throw new Error(`[Ophel] Required text resource is missing: ${name}`)
  }
  return text
}

const jsonResources = new Map<string, unknown>()

export function readUserscriptJsonResource(name: string): unknown {
  if (!jsonResources.has(name)) {
    jsonResources.set(name, JSON.parse(readUserscriptResourceText(name)))
  }
  return jsonResources.get(name)
}

function readStringMapValue(name: string, key: string): string {
  const values = readUserscriptJsonResource(name)
  if (!values || typeof values !== "object" || Array.isArray(values)) {
    throw new Error(`[Ophel] Invalid string map resource: ${name}`)
  }
  const value = (values as Record<string, unknown>)[key]
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`[Ophel] Required resource entry is missing: ${name}/${key}`)
  }
  return value
}

export function readUserscriptInlineStyle(key: string): string {
  return readStringMapValue(USERSCRIPT_RESOURCE_DEFINITIONS.inlineStyles.metaName, key)
}

export function readUserscriptSvgPath(key: string): string {
  return readStringMapValue(USERSCRIPT_RESOURCE_DEFINITIONS.svgPaths.metaName, key)
}
