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

const URL_ATTR_PATTERN = /\b(?:href|src|url|xlink:href)\b/i
const EVENT_ATTR_PATTERN = /^on/i
const UNSAFE_STYLE_PATTERN = /url\s*\(|expression\s*\(|javascript:/i
const UNSAFE_VALUE_PATTERN = /javascript:|data:/i

const isSafeSvgAttr = (name: string, value: string): boolean => {
  if (EVENT_ATTR_PATTERN.test(name)) return false
  if (URL_ATTR_PATTERN.test(name)) return false
  if (!ALLOWED_SVG_ATTRS.has(name)) return false
  if (UNSAFE_VALUE_PATTERN.test(value)) return false
  if (name === "style" && UNSAFE_STYLE_PATTERN.test(value)) return false
  return true
}

const sanitizeElement = (element: Element, doc: Document): Element | null => {
  const tagName = element.tagName
  if (!ALLOWED_SVG_TAGS.has(tagName)) return null

  const next = doc.createElementNS("http://www.w3.org/2000/svg", tagName)

  Array.from(element.attributes).forEach((attr) => {
    if (isSafeSvgAttr(attr.name, attr.value)) {
      next.setAttribute(attr.name, attr.value)
    }
  })

  Array.from(element.childNodes).forEach((child) => {
    if (child.nodeType === Node.TEXT_NODE) {
      if (tagName === "title" || tagName === "desc") {
        next.appendChild(doc.createTextNode(child.textContent || ""))
      }
      return
    }

    if (child.nodeType !== Node.ELEMENT_NODE) return

    const sanitizedChild = sanitizeElement(child as Element, doc)
    if (sanitizedChild) {
      next.appendChild(sanitizedChild)
    }
  })

  return next
}

export const sanitizeSvgIcon = (input: string): string => {
  const trimmed = input.trim()
  if (!trimmed) return ""

  const parser = new DOMParser()
  const doc = parser.parseFromString(trimmed, "image/svg+xml")
  if (doc.querySelector("parsererror")) return ""

  const svg = doc.documentElement
  if (!svg || svg.tagName !== "svg") return ""

  const sanitized = sanitizeElement(svg, doc)
  if (!sanitized) return ""

  if (!sanitized.getAttribute("viewBox")) {
    sanitized.setAttribute("viewBox", "0 0 24 24")
  }
  sanitized.setAttribute("aria-hidden", "true")

  return new XMLSerializer().serializeToString(sanitized)
}
