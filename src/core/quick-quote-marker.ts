import type { PromptQuoteReference, PromptSelectionAnchor } from "~core/prompt-action-types"

const QUICK_QUOTE_MARKER_LABEL = "\u2063"
const QUICK_QUOTE_MARKER_HREF = "#ophel-quick-quote"
const QUICK_QUOTE_MARKER_TITLE_PREFIX = "ophel-quick-quote:"
const LEGACY_QUICK_QUOTE_MARKER_URL = "https://ophel.local/quick-quote#"
const QUICK_QUOTE_MARKER_VERSION = 2
const MAX_MARKER_PAYLOAD_LENGTH = 20000
const MAX_MARKER_SELECTED_TEXT_LENGTH = 1200

const MARKER_MARKDOWN_RE = /\[\u2063\]\(#ophel-quick-quote\s+"ophel-quick-quote:([^"]+)"\)/g
const LEGACY_MARKER_MARKDOWN_RE = /\[\u2063\]\(https:\/\/ophel\.local\/quick-quote#([^)]+)\)/g
const MARKER_LINK_PREFIX_RE = /\[\u2063\]\($/
const MARKER_LINK_SUFFIX_RE = /^(?:"ophel-quick-quote:[^"]+")?\)/

/**
 * Compact anchor for URL embedding - only essential fields for relocation.
 */
interface CompactSelectionAnchor {
  siteId: string
  sessionId: string
  selectedText: string
  textSignature: string
  beforeText?: string
  afterText?: string
  rootSelector?: string // CSS selector for precise message identification
  rootIndex?: number
  rootTextSignature?: string
  selectionIndex?: number
}

interface QuickQuoteMarkerPayload {
  v: typeof QUICK_QUOTE_MARKER_VERSION
  ref: {
    id: string
    selectedText: string
    anchor: CompactSelectionAnchor
    chainId?: string
    chainTitle?: string
    stepIndex?: number
    stepTotal?: number
  }
}

/**
 * Legacy v1 payload structure for backward compatibility.
 */
interface LegacyQuickQuoteMarkerPayload {
  v: 1
  ref: PromptQuoteReference
}

/**
 * Compact the reference for URL embedding - drop unnecessary fields.
 */
const compactReferenceForMarker = (
  reference: PromptQuoteReference,
): QuickQuoteMarkerPayload["ref"] => {
  const selectedText =
    reference.selectedText.length <= MAX_MARKER_SELECTED_TEXT_LENGTH
      ? reference.selectedText
      : reference.selectedText.slice(0, MAX_MARKER_SELECTED_TEXT_LENGTH).trimEnd()

  const anchor: CompactSelectionAnchor = {
    siteId: reference.anchor.siteId,
    sessionId: reference.anchor.sessionId,
    selectedText,
    textSignature: reference.anchor.textSignature,
    beforeText: reference.anchor.beforeText,
    afterText: reference.anchor.afterText,
    rootSelector: reference.anchor.rootSelector,
    rootIndex: reference.anchor.rootIndex,
    rootTextSignature: reference.anchor.rootTextSignature,
    selectionIndex: reference.anchor.selectionIndex,
  }

  return {
    id: reference.id,
    selectedText,
    anchor,
    chainId: reference.chainId,
    chainTitle: reference.chainTitle,
    stepIndex: reference.stepIndex,
    stepTotal: reference.stepTotal,
  }
}

const encodeMarkerPayload = (reference: PromptQuoteReference): string =>
  encodeURIComponent(
    JSON.stringify({
      v: QUICK_QUOTE_MARKER_VERSION,
      ref: compactReferenceForMarker(reference),
    } satisfies QuickQuoteMarkerPayload),
  )

const hasQuickQuoteMarker = (content: string): boolean => {
  MARKER_MARKDOWN_RE.lastIndex = 0
  LEGACY_MARKER_MARKDOWN_RE.lastIndex = 0
  const hasMarker = MARKER_MARKDOWN_RE.test(content) || LEGACY_MARKER_MARKDOWN_RE.test(content)
  MARKER_MARKDOWN_RE.lastIndex = 0
  LEGACY_MARKER_MARKDOWN_RE.lastIndex = 0
  return hasMarker
}

/**
 * Reconstruct full PromptQuoteReference from compact payload.
 */
const expandCompactReference = (compact: QuickQuoteMarkerPayload["ref"]): PromptQuoteReference => {
  const fullAnchor: PromptSelectionAnchor = {
    siteId: compact.anchor.siteId,
    sessionId: compact.anchor.sessionId,
    cid: undefined,
    selectedText: compact.anchor.selectedText,
    textSignature: compact.anchor.textSignature,
    beforeText: compact.anchor.beforeText,
    afterText: compact.anchor.afterText,
    rootSelector: compact.anchor.rootSelector,
    rootIndex: compact.anchor.rootIndex,
    rootTextSignature: compact.anchor.rootTextSignature,
    selectionIndex: compact.anchor.selectionIndex,
    scrollTop: undefined,
    createdAt: Date.now(),
  }

  return {
    id: compact.id,
    selectedText: compact.selectedText,
    quoteText: compact.selectedText
      .split("\n")
      .map((line) => `> ${line}`)
      .join("\n"),
    anchor: fullAnchor,
    chainId: compact.chainId,
    chainTitle: compact.chainTitle,
    stepId: undefined,
    stepIndex: compact.stepIndex,
    stepTotal: compact.stepTotal,
    createdAt: Date.now(),
  }
}

const decodeMarkerPayload = (encoded: string): PromptQuoteReference | null => {
  if (!encoded || encoded.length > MAX_MARKER_PAYLOAD_LENGTH) return null

  try {
    const payload = JSON.parse(decodeURIComponent(encoded)) as
      | Partial<QuickQuoteMarkerPayload>
      | Partial<LegacyQuickQuoteMarkerPayload>

    // Handle v1 (legacy full payload)
    if (payload.v === 1) {
      const legacyPayload = payload as Partial<LegacyQuickQuoteMarkerPayload>
      const reference = legacyPayload.ref
      if (
        !reference ||
        typeof reference.id !== "string" ||
        typeof reference.selectedText !== "string" ||
        typeof reference.quoteText !== "string" ||
        !reference.anchor ||
        typeof reference.anchor.siteId !== "string" ||
        typeof reference.anchor.sessionId !== "string"
      ) {
        return null
      }
      return reference
    }

    // Handle v2 (compact payload)
    if (payload.v === 2) {
      const v2Payload = payload as Partial<QuickQuoteMarkerPayload>
      const ref = v2Payload.ref
      if (
        !ref ||
        typeof ref.id !== "string" ||
        typeof ref.selectedText !== "string" ||
        !ref.anchor ||
        typeof ref.anchor.siteId !== "string" ||
        typeof ref.anchor.sessionId !== "string" ||
        typeof ref.anchor.selectedText !== "string" ||
        typeof ref.anchor.textSignature !== "string"
      ) {
        return null
      }
      return expandCompactReference(ref)
    }

    return null
  } catch {
    return null
  }
}

export const appendQuickQuoteMarker = (
  content: string,
  reference?: PromptQuoteReference | null,
): string => {
  const trimmed = content.trim()
  if (!trimmed || !reference) return trimmed
  if (hasQuickQuoteMarker(trimmed)) return trimmed

  return `${trimmed}\n\n[${QUICK_QUOTE_MARKER_LABEL}](${QUICK_QUOTE_MARKER_HREF} "${QUICK_QUOTE_MARKER_TITLE_PREFIX}${encodeMarkerPayload(reference)}")`
}

export const stripQuickQuoteMarkers = (content: string): string => {
  MARKER_MARKDOWN_RE.lastIndex = 0
  LEGACY_MARKER_MARKDOWN_RE.lastIndex = 0
  const stripped = content
    .replace(MARKER_MARKDOWN_RE, "")
    .replace(LEGACY_MARKER_MARKDOWN_RE, "")
    .replace(new RegExp(QUICK_QUOTE_MARKER_LABEL, "g"), "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
  MARKER_MARKDOWN_RE.lastIndex = 0
  LEGACY_MARKER_MARKDOWN_RE.lastIndex = 0
  return stripped
}

const getEncodedMarkerFromAnchor = (anchor: HTMLAnchorElement): string | null => {
  if (anchor.title.startsWith(QUICK_QUOTE_MARKER_TITLE_PREFIX)) {
    return anchor.title.slice(QUICK_QUOTE_MARKER_TITLE_PREFIX.length)
  }

  const legacyIndex = anchor.href.indexOf(LEGACY_QUICK_QUOTE_MARKER_URL)
  if (legacyIndex >= 0) {
    return anchor.href.slice(legacyIndex + LEGACY_QUICK_QUOTE_MARKER_URL.length)
  }

  return null
}

export const extractQuickQuoteMarkersFromElement = (element: Element): PromptQuoteReference[] => {
  const references: PromptQuoteReference[] = []
  const seen = new Set<string>()

  const addReference = (reference: PromptQuoteReference | null) => {
    if (!reference || seen.has(reference.id)) return
    seen.add(reference.id)
    references.push(reference)
  }

  element.querySelectorAll<HTMLAnchorElement>("a[href]").forEach((anchor) => {
    const encoded = getEncodedMarkerFromAnchor(anchor)
    if (encoded) addReference(decodeMarkerPayload(encoded))
  })

  const text = element.textContent || ""
  let match: RegExpExecArray | null
  MARKER_MARKDOWN_RE.lastIndex = 0
  while ((match = MARKER_MARKDOWN_RE.exec(text))) {
    addReference(decodeMarkerPayload(match[1]))
  }
  MARKER_MARKDOWN_RE.lastIndex = 0

  LEGACY_MARKER_MARKDOWN_RE.lastIndex = 0
  while ((match = LEGACY_MARKER_MARKDOWN_RE.exec(text))) {
    addReference(decodeMarkerPayload(match[1]))
  }
  LEGACY_MARKER_MARKDOWN_RE.lastIndex = 0

  return references
}

export const removeQuickQuoteMarkerNodes = (element: Element): void => {
  element.querySelectorAll<HTMLAnchorElement>("a[href]").forEach((anchor) => {
    if (getEncodedMarkerFromAnchor(anchor)) {
      const previous = anchor.previousSibling
      if (previous instanceof Text) {
        previous.data = previous.data.replace(MARKER_LINK_PREFIX_RE, "")
        if (!previous.data) previous.remove()
      }

      const next = anchor.nextSibling
      if (next instanceof Text) {
        next.data = next.data.replace(MARKER_LINK_SUFFIX_RE, "")
        if (!next.data) next.remove()
      }

      anchor.remove()
    }
  })

  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT, {
    acceptNode: (node) =>
      node.parentElement?.closest(".gh-root, .gh-main-panel, .gh-quick-quote-chip")
        ? NodeFilter.FILTER_REJECT
        : NodeFilter.FILTER_ACCEPT,
  })

  const nodes: Text[] = []
  let current = walker.nextNode()
  while (current) {
    nodes.push(current as Text)
    current = walker.nextNode()
  }

  nodes.forEach((node) => {
    const cleaned = stripQuickQuoteMarkers(node.data)
    if (cleaned !== node.data) {
      node.data = cleaned
    }
  })
}
