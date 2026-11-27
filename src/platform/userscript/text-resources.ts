declare function GM_getResourceText(name: string): string

export function readUserscriptResourceText(name: string): string {
  const text = GM_getResourceText(name)
  if (typeof text !== "string" || text.length === 0) {
    throw new Error(`[Ophel] Required text resource is missing: ${name}`)
  }
  return text
}
