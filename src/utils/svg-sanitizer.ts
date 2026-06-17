const SVG_NS = "http://www.w3.org/2000/svg"

const ALLOWED_SVG_TAGS = new Set([
  "svg",
  "g",
  "path",
  "circle",
  "rect",
  "line",
  "polyline",
  "polygon",
  "ellipse",
  "defs",
  "linearGradient",
  "radialGradient",
  "stop",
  "title",
  "desc",
])

const ALLOWED_SVG_ATTRS = new Set([
  "aria-hidden",
  "class",
  "clip-rule",
  "cx",
  "cy",
  "d",
  "fill",
  "fill-rule",
  "height",
  "id",
  "offset",
  "opacity",
  "points",
  "r",
  "rx",
  "ry",
  "stroke",
  "stroke-linecap",
  "stroke-linejoin",
  "stroke-width",
  "style",
  "transform",
  "viewBox",
  "width",
  "x",
  "x1",
  "x2",
  "y",
  "y1",
  "y2",
])

const TAG_PATTERN = /<[^>]+>/g
const ATTR_PATTERN = /([A-Za-z_:][\w:.-]*)\s*=\s*(?:"([^"]*)"|'([^']*)')/g
const URL_ATTR_PATTERN = /\b(?:href|src|url|xlink:href)\b/i
const EVENT_ATTR_PATTERN = /^on/i
const UNSAFE_STYLE_PATTERN = /url\s*\(|expression\s*\(|javascript:/i
const UNSAFE_VALUE_PATTERN = /javascript:|data:/i

interface ParsedSvgTag {
  tagName: string
  isClosing: boolean
  isSelfClosing: boolean
  attrs: Array<{ name: string; value: string }>
}

const isSafeSvgAttr = (name: string, value: string): boolean => {
  if (EVENT_ATTR_PATTERN.test(name)) return false
  if (URL_ATTR_PATTERN.test(name)) return false
  if (!ALLOWED_SVG_ATTRS.has(name)) return false
  if (UNSAFE_VALUE_PATTERN.test(value)) return false
  if (name === "style" && UNSAFE_STYLE_PATTERN.test(value)) return false
  return true
}

const parseSvgAttrs = (source: string): Array<{ name: string; value: string }> | null => {
  const attrs: Array<{ name: string; value: string }> = []
  let lastIndex = 0

  for (const match of source.matchAll(ATTR_PATTERN)) {
    const index = match.index ?? 0
    if (source.slice(lastIndex, index).trim()) return null

    attrs.push({
      name: match[1],
      value: match[2] ?? match[3] ?? "",
    })
    lastIndex = index + match[0].length
  }

  if (source.slice(lastIndex).trim()) return null
  return attrs
}

const parseSvgTag = (token: string): ParsedSvgTag | null => {
  if (/^<\s*(?:!|\?)/.test(token)) return null

  const closingMatch = token.match(/^<\s*\/\s*([A-Za-z][\w:-]*)\s*>$/)
  if (closingMatch) {
    return {
      tagName: closingMatch[1],
      isClosing: true,
      isSelfClosing: false,
      attrs: [],
    }
  }

  const isSelfClosing = /\/\s*>$/.test(token)
  const openingMatch = token.match(/^<\s*([A-Za-z][\w:-]*)([\s\S]*?)\/?\s*>$/)
  if (!openingMatch) return null

  const attrs = parseSvgAttrs(openingMatch[2].trim())
  if (!attrs) return null

  return {
    tagName: openingMatch[1],
    isClosing: false,
    isSelfClosing,
    attrs,
  }
}

const appendSvgText = (stack: Element[], text: string, doc: Document): boolean => {
  if (!text) return true

  const parent = stack[stack.length - 1]
  if (!parent) return text.trim().length === 0

  if (parent.tagName === "title" || parent.tagName === "desc") {
    parent.appendChild(doc.createTextNode(text))
  }

  return true
}

export const createSanitizedSvgIconElement = (
  input: string,
  doc: Document = document,
): SVGSVGElement | null => {
  const trimmed = input.trim()
  if (!trimmed) return null

  let root: Element | null = null
  const stack: Element[] = []
  let lastIndex = 0

  for (const match of trimmed.matchAll(TAG_PATTERN)) {
    const index = match.index ?? 0
    if (!appendSvgText(stack, trimmed.slice(lastIndex, index), doc)) return null

    const parsed = parseSvgTag(match[0])
    if (!parsed) return null
    if (!ALLOWED_SVG_TAGS.has(parsed.tagName)) return null

    if (parsed.isClosing) {
      const current = stack[stack.length - 1]
      if (!current || current.tagName !== parsed.tagName) return null
      stack.pop()
      lastIndex = index + match[0].length
      continue
    }

    const next = doc.createElementNS(SVG_NS, parsed.tagName)
    parsed.attrs.forEach((attr) => {
      if (isSafeSvgAttr(attr.name, attr.value)) {
        next.setAttribute(attr.name, attr.value)
      }
    })

    if (!root) {
      if (parsed.tagName !== "svg") return null
      root = next
    } else {
      const parent = stack[stack.length - 1]
      if (!parent) return null
      parent.appendChild(next)
    }

    if (!parsed.isSelfClosing) {
      stack.push(next)
    }

    lastIndex = index + match[0].length
  }

  if (!appendSvgText(stack, trimmed.slice(lastIndex), doc)) return null
  if (!root || stack.length > 0 || root.tagName !== "svg") return null

  if (!root.getAttribute("viewBox")) {
    root.setAttribute("viewBox", "0 0 24 24")
  }
  root.setAttribute("aria-hidden", "true")

  return root as SVGSVGElement
}

export const sanitizeSvgIcon = (input: string): string => {
  const svg = createSanitizedSvgIconElement(input)
  if (!svg) return ""
  return new XMLSerializer().serializeToString(svg)
}
