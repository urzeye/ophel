import type { PromptQuoteReference, PromptSelectionAnchor } from "~core/prompt-action-types"

const QUICK_QUOTE_MARKER_LABEL = "\u2063"
const QUICK_QUOTE_MARKER_HREF = "#ophel-quick-quote"
const QUICK_QUOTE_MARKER_TITLE_PREFIX = "ophel-quick-quote:"
const QUICK_QUOTE_MARKER_VERSION = 3
const MAX_MARKER_PAYLOAD_LENGTH = 1600

const MARKER_MARKDOWN_RE =
  /\[\u2063\]\(#ophel-quick-quote\s+"ophel-quick-quote:([A-Za-z0-9_-]+)"\)/g
const MARKER_LINK_PREFIX_RE = /\[\u2063\]\($/
const MARKER_LINK_SUFFIX_RE = /^(?:"ophel-quick-quote:[A-Za-z0-9_-]+")?\)/

type MarkerKind = "full" | "ref"

interface CompactSelectionAnchor {
  /** normalized selected text length */
  n?: number
  /** normalized selected text hash */
  h?: string
  /** normalized selected text prefix */
  p?: string
  /** normalized selected text suffix */
  s?: string
  /** preceding context */
  b?: string
  /** following context */
  f?: string
  /** precise message selector, if available */
  r?: string
  /** message root index fallback */
  x?: number
  /** message root text signature */
  g?: string
  /** normalized selection start offset */
  o?: number
}

interface FullMarkerPayload {
  v: typeof QUICK_QUOTE_MARKER_VERSION
  t: "q"
  i: string
  l: string
  a: CompactSelectionAnchor
}

interface RefMarkerPayload {
  v: typeof QUICK_QUOTE_MARKER_VERSION
  t: "r"
  i: string
  l?: string
}

type QuickQuoteMarkerPayload = FullMarkerPayload | RefMarkerPayload

export interface QuickQuoteMarkerEntry {
  id: string
  label: string
  reference?: PromptQuoteReference
  kind: MarkerKind
}

const truncateText = (text: string, max: number): string => {
  const normalized = text.replace(/\s+/g, " ").trim()
  if (normalized.length <= max) return normalized
  return normalized.slice(0, max).trimEnd()
}

const takeStart = (text: string | undefined, max: number): string | undefined => {
  const normalized = (text || "").replace(/\s+/g, " ").trim()
  return normalized ? normalized.slice(0, max).trimEnd() : undefined
}

const takeEnd = (text: string | undefined, max: number): string | undefined => {
  const normalized = (text || "").replace(/\s+/g, " ").trim()
  return normalized ? normalized.slice(Math.max(0, normalized.length - max)).trimStart() : undefined
}

const compactObject = <T extends object>(input: T): T => {
  const record = input as Record<string, unknown>
  Object.keys(input).forEach((key) => {
    const value = record[key]
    if (value === undefined || value === "" || value === null) {
      delete record[key]
    }
  })
  return input
}

const encodeBase64Url = (value: string): string => {
  const bytes = new TextEncoder().encode(value)
  let binary = ""
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte)
  })
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "")
}

const decodeBase64Url = (value: string): string => {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/")
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=")
  const binary = atob(padded)
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0))
  return new TextDecoder().decode(bytes)
}

interface PayloadProfile {
  label: number
  edge: number
  context: number
  rootSignature: number
  rootSelector: boolean
}

const PAYLOAD_PROFILES: PayloadProfile[] = [
  { label: 80, edge: 60, context: 40, rootSignature: 60, rootSelector: true },
  { label: 64, edge: 48, context: 32, rootSignature: 40, rootSelector: true },
  { label: 48, edge: 36, context: 24, rootSignature: 0, rootSelector: true },
  { label: 36, edge: 28, context: 16, rootSignature: 0, rootSelector: false },
]

const buildFullPayload = (
  reference: PromptQuoteReference,
  profile: PayloadProfile,
): FullMarkerPayload => {
  const anchor = reference.anchor
  const compactAnchor = compactObject<CompactSelectionAnchor>({
    n: anchor.selectedLength,
    h: anchor.selectedHash,
    p: takeStart(
      anchor.selectedPrefix || anchor.textSignature || anchor.selectedText,
      profile.edge,
    ),
    s: takeEnd(anchor.selectedSuffix || anchor.selectedText, profile.edge),
    b: takeEnd(anchor.beforeText, profile.context),
    f: takeStart(anchor.afterText, profile.context),
    r: profile.rootSelector ? anchor.rootSelector : undefined,
    x: anchor.rootIndex,
    g:
      profile.rootSignature > 0
        ? takeStart(anchor.rootTextSignature, profile.rootSignature)
        : undefined,
    o: anchor.selectionIndex,
  })

  return {
    v: QUICK_QUOTE_MARKER_VERSION,
    t: "q",
    i: reference.id,
    l: truncateText(reference.selectedText, profile.label),
    a: compactAnchor,
  }
}

const buildRefPayload = (reference: PromptQuoteReference): RefMarkerPayload => ({
  v: QUICK_QUOTE_MARKER_VERSION,
  t: "r",
  i: reference.id,
  l: truncateText(reference.selectedText, 48),
})

const encodePayload = (payload: QuickQuoteMarkerPayload): string =>
  encodeBase64Url(JSON.stringify(payload))

const encodeFullPayload = (reference: PromptQuoteReference): string => {
  for (const profile of PAYLOAD_PROFILES) {
    const encoded = encodePayload(buildFullPayload(reference, profile))
    if (encoded.length <= MAX_MARKER_PAYLOAD_LENGTH) return encoded
  }

  return encodePayload(buildFullPayload(reference, PAYLOAD_PROFILES[PAYLOAD_PROFILES.length - 1]))
}

const encodeMarkerPayload = (reference: PromptQuoteReference, kind: MarkerKind): string =>
  kind === "ref" ? encodePayload(buildRefPayload(reference)) : encodeFullPayload(reference)

const hasQuickQuoteMarker = (content: string): boolean => {
  MARKER_MARKDOWN_RE.lastIndex = 0
  const hasMarker = MARKER_MARKDOWN_RE.test(content)
  MARKER_MARKDOWN_RE.lastIndex = 0
  return hasMarker
}

const expandFullPayload = (payload: FullMarkerPayload): PromptQuoteReference => {
  const anchor: PromptSelectionAnchor = {
    siteId: "",
    sessionId: "",
    selectedText: payload.l,
    textSignature: payload.a.p || payload.l,
    selectedPrefix: payload.a.p,
    selectedSuffix: payload.a.s,
    selectedLength: payload.a.n,
    selectedHash: payload.a.h,
    beforeText: payload.a.b,
    afterText: payload.a.f,
    rootSelector: payload.a.r,
    rootIndex: payload.a.x,
    rootTextSignature: payload.a.g,
    selectionIndex: payload.a.o,
    createdAt: Date.now(),
  }

  return {
    id: payload.i,
    selectedText: payload.l,
    quoteText: payload.l
      .split("\n")
      .map((line) => `> ${line}`)
      .join("\n"),
    anchor,
    createdAt: Date.now(),
  }
}

const decodeMarkerPayload = (encoded: string): QuickQuoteMarkerEntry | null => {
  if (!encoded || encoded.length > MAX_MARKER_PAYLOAD_LENGTH * 2) return null

  try {
    const payload = JSON.parse(decodeBase64Url(encoded)) as Partial<QuickQuoteMarkerPayload>
    if (payload.v !== QUICK_QUOTE_MARKER_VERSION || typeof payload.i !== "string") return null

    if (payload.t === "q") {
      const fullPayload = payload as Partial<FullMarkerPayload>
      if (
        typeof fullPayload.l !== "string" ||
        !fullPayload.a ||
        typeof fullPayload.a !== "object"
      ) {
        return null
      }

      return {
        id: payload.i,
        label: fullPayload.l,
        reference: expandFullPayload(fullPayload as FullMarkerPayload),
        kind: "full",
      }
    }

    if (payload.t === "r") {
      const refPayload = payload as Partial<RefMarkerPayload>
      return {
        id: payload.i,
        label: typeof refPayload.l === "string" ? refPayload.l : "",
        kind: "ref",
      }
    }

    return null
  } catch {
    return null
  }
}

export const appendQuickQuoteMarker = (
  content: string,
  reference?: PromptQuoteReference | null,
  options: { kind?: MarkerKind } = {},
): string => {
  const trimmed = content.trim()
  if (!trimmed || !reference) return trimmed
  if (hasQuickQuoteMarker(trimmed)) return trimmed

  const encoded = encodeMarkerPayload(reference, options.kind || "full")
  return `${trimmed}\n\n[${QUICK_QUOTE_MARKER_LABEL}](${QUICK_QUOTE_MARKER_HREF} "${QUICK_QUOTE_MARKER_TITLE_PREFIX}${encoded}")`
}

export const stripQuickQuoteMarkers = (content: string): string => {
  MARKER_MARKDOWN_RE.lastIndex = 0
  const stripped = content
    .replace(MARKER_MARKDOWN_RE, "")
    .replace(new RegExp(QUICK_QUOTE_MARKER_LABEL, "g"), "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
  MARKER_MARKDOWN_RE.lastIndex = 0
  return stripped
}

const getEncodedMarkerFromAnchor = (anchor: HTMLAnchorElement): string | null => {
  if (!anchor.title.startsWith(QUICK_QUOTE_MARKER_TITLE_PREFIX)) return null
  return anchor.title.slice(QUICK_QUOTE_MARKER_TITLE_PREFIX.length)
}

export const extractQuickQuoteMarkerEntriesFromElement = (
  element: Element,
): QuickQuoteMarkerEntry[] => {
  const entries: QuickQuoteMarkerEntry[] = []
  const seen = new Set<string>()

  const addEntry = (entry: QuickQuoteMarkerEntry | null) => {
    if (!entry || seen.has(`${entry.kind}:${entry.id}`)) return
    seen.add(`${entry.kind}:${entry.id}`)
    entries.push(entry)
  }

  element.querySelectorAll<HTMLAnchorElement>("a[href]").forEach((anchor) => {
    const encoded = getEncodedMarkerFromAnchor(anchor)
    if (encoded) addEntry(decodeMarkerPayload(encoded))
  })

  const text = element.textContent || ""
  let match: RegExpExecArray | null
  MARKER_MARKDOWN_RE.lastIndex = 0
  while ((match = MARKER_MARKDOWN_RE.exec(text))) {
    addEntry(decodeMarkerPayload(match[1]))
  }
  MARKER_MARKDOWN_RE.lastIndex = 0

  return entries
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
