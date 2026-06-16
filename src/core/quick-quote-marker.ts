import type { PromptQuoteReference, PromptSelectionAnchor } from "~core/prompt-action-types"

const QUICK_QUOTE_MARKER_LABEL = "\u2063"
const QUICK_QUOTE_MARKER_HREF = "#ophel-quick-quote"
const QUICK_QUOTE_MARKER_TITLE_PREFIX = "ophel-quick-quote:"
const QUICK_QUOTE_MARKER_VERSION = 3
const MAX_MARKER_PAYLOAD_LENGTH = 1600
const MAX_PENDING_REFERENCE_COUNT = 120
const PENDING_REFERENCE_TTL_MS = 2 * 60 * 60 * 1000

const MARKER_MARKDOWN_RE =
  /\[\u2063\]\(#ophel-quick-quote\s+"ophel-quick-quote:([A-Za-z0-9_-]+)"\)/g
const RENDERED_MARKER_MARKDOWN_RE =
  /\[\u2063\]\((?:[^)\s"]*#ophel-quick-quote|#ophel-quick-quote)(?:\s+"ophel-quick-quote:[A-Za-z0-9_-]+")?\)/g
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

interface PendingQuickQuoteReference {
  contentKey: string
  reference: PromptQuoteReference
  createdAt: number
  requireMarkerResidue: boolean
  matchedScopeKey?: string
}

const pendingQuickQuoteReferences: PendingQuickQuoteReference[] = []
const pendingQuickQuoteReferenceById = new Map<string, PromptQuoteReference>()

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

const stripQuickQuoteMarkerSyntax = (content: string): string => {
  MARKER_MARKDOWN_RE.lastIndex = 0
  RENDERED_MARKER_MARKDOWN_RE.lastIndex = 0
  const stripped = content
    .replace(MARKER_MARKDOWN_RE, "")
    .replace(RENDERED_MARKER_MARKDOWN_RE, "")
    .replace(new RegExp(QUICK_QUOTE_MARKER_LABEL, "g"), "")
  MARKER_MARKDOWN_RE.lastIndex = 0
  RENDERED_MARKER_MARKDOWN_RE.lastIndex = 0
  return stripped
}

const normalizeQuickQuoteMatchText = (content: string): string =>
  stripQuickQuoteMarkerSyntax(content)
    .replace(/^[ \t]{0,3}>[ \t]?/gm, "")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/[*_`~]/g, "")
    .replace(/\s+/g, " ")
    .trim()

const extractQuickQuoteMarkerEntriesFromText = (text: string): QuickQuoteMarkerEntry[] => {
  const entries: QuickQuoteMarkerEntry[] = []
  const seen = new Set<string>()
  let match: RegExpExecArray | null

  MARKER_MARKDOWN_RE.lastIndex = 0
  while ((match = MARKER_MARKDOWN_RE.exec(text))) {
    const entry = decodeMarkerPayload(match[1])
    if (!entry || seen.has(`${entry.kind}:${entry.id}`)) continue
    seen.add(`${entry.kind}:${entry.id}`)
    entries.push(entry)
  }
  MARKER_MARKDOWN_RE.lastIndex = 0

  return entries
}

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

const prunePendingQuickQuoteReferences = (now = Date.now()): void => {
  const cutoff = now - PENDING_REFERENCE_TTL_MS

  for (let index = pendingQuickQuoteReferences.length - 1; index >= 0; index -= 1) {
    if (pendingQuickQuoteReferences[index].createdAt < cutoff) {
      pendingQuickQuoteReferences.splice(index, 1)
    }
  }

  while (pendingQuickQuoteReferences.length > MAX_PENDING_REFERENCE_COUNT) {
    pendingQuickQuoteReferences.shift()
  }

  const liveIds = new Set(pendingQuickQuoteReferences.map((entry) => entry.reference.id))
  Array.from(pendingQuickQuoteReferenceById.keys()).forEach((id) => {
    if (!liveIds.has(id)) pendingQuickQuoteReferenceById.delete(id)
  })
}

const rememberQuickQuoteReference = (
  content: string,
  reference?: PromptQuoteReference | null,
  options: { requireMarkerResidue?: boolean } = {},
): void => {
  if (!reference) return

  const contentKey = normalizeQuickQuoteMatchText(content)
  if (!contentKey) return

  const now = Date.now()
  prunePendingQuickQuoteReferences(now)
  pendingQuickQuoteReferenceById.set(reference.id, reference)

  const existing = pendingQuickQuoteReferences.find(
    (entry) =>
      entry.reference.id === reference.id &&
      entry.contentKey === contentKey &&
      entry.requireMarkerResidue === (options.requireMarkerResidue ?? true),
  )
  if (existing) {
    existing.createdAt = now
    existing.reference = reference
    existing.matchedScopeKey = undefined
    return
  }

  pendingQuickQuoteReferences.push({
    contentKey,
    reference,
    createdAt: now,
    requireMarkerResidue: options.requireMarkerResidue ?? true,
  })
}

export const rememberQuickQuoteReferenceForContent = (
  content: string,
  reference?: PromptQuoteReference | null,
): void => {
  rememberQuickQuoteReference(content, reference, { requireMarkerResidue: false })
}

export const appendQuickQuoteMarker = (
  content: string,
  reference?: PromptQuoteReference | null,
  options: { kind?: MarkerKind } = {},
): string => {
  const trimmed = content.trim()
  if (!trimmed || !reference) return trimmed
  rememberQuickQuoteReference(trimmed, reference)
  if (hasQuickQuoteMarker(trimmed)) return trimmed

  const encoded = encodeMarkerPayload(reference, options.kind || "full")
  return `${trimmed}\n\n[${QUICK_QUOTE_MARKER_LABEL}](${QUICK_QUOTE_MARKER_HREF} "${QUICK_QUOTE_MARKER_TITLE_PREFIX}${encoded}")`
}

export const stripQuickQuoteMarkers = (content: string): string => {
  const stripped = stripQuickQuoteMarkerSyntax(content).replace(
    new RegExp(QUICK_QUOTE_MARKER_LABEL, "g"),
    "",
  )

  return stripped
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
}

const stripQuickQuoteMarkersPreservingSpacing = (content: string): string => {
  return stripQuickQuoteMarkerSyntax(content).replace(new RegExp(QUICK_QUOTE_MARKER_LABEL, "g"), "")
}

interface ResolvePendingQuickQuoteMarkerOptions {
  allowMarkerlessMatch?: boolean
  currentSessionId?: string
  currentSiteId?: string
  markerlessScopeKey?: string
}

const isReferenceInCurrentScope = (
  reference: PromptQuoteReference,
  options: ResolvePendingQuickQuoteMarkerOptions,
): boolean => {
  const { siteId, sessionId } = reference.anchor
  if (options.currentSiteId && siteId && siteId !== options.currentSiteId) return false
  if (options.currentSessionId && sessionId && sessionId !== options.currentSessionId) return false
  return true
}

export const resolvePendingQuickQuoteMarkerEntriesFromElement = (
  element: Element,
  visibleText?: string,
  options: ResolvePendingQuickQuoteMarkerOptions = {},
): QuickQuoteMarkerEntry[] => {
  const hasMarkerResidue = hasQuickQuoteMarkerResidue(element)

  prunePendingQuickQuoteReferences()
  const contentKey = normalizeQuickQuoteMatchText(visibleText || element.textContent || "")
  if (!contentKey) return []

  const entries: QuickQuoteMarkerEntry[] = []
  const exactMatches: PendingQuickQuoteReference[] = []
  const looseMatches: PendingQuickQuoteReference[] = []

  pendingQuickQuoteReferences.forEach((pending) => {
    if (pending.requireMarkerResidue && !hasMarkerResidue) return

    if (!pending.requireMarkerResidue) {
      if (!options.markerlessScopeKey) return
      if (!isReferenceInCurrentScope(pending.reference, options)) return
      if (pending.matchedScopeKey && pending.matchedScopeKey !== options.markerlessScopeKey) return
      if (!pending.matchedScopeKey && options.allowMarkerlessMatch === false) return
    }

    const exactMatch = pending.contentKey === contentKey
    const allowMarkerlessLooseMatch =
      !pending.requireMarkerResidue &&
      (options.allowMarkerlessMatch !== false ||
        pending.matchedScopeKey === options.markerlessScopeKey)
    const looseMatchMinLength = pending.requireMarkerResidue ? 24 : 1
    const looseMatch =
      (hasMarkerResidue || allowMarkerlessLooseMatch) &&
      Math.min(pending.contentKey.length, contentKey.length) >= looseMatchMinLength &&
      (pending.contentKey.includes(contentKey) || contentKey.includes(pending.contentKey))

    if (exactMatch) {
      exactMatches.push(pending)
    } else if (looseMatch) {
      looseMatches.push(pending)
    }
  })

  const matched = exactMatches.at(-1) || looseMatches.at(-1)
  if (matched) {
    if (!matched.requireMarkerResidue && options.markerlessScopeKey && !matched.matchedScopeKey) {
      matched.matchedScopeKey = options.markerlessScopeKey
    }

    entries.push({
      id: matched.reference.id,
      label: matched.reference.selectedText,
      reference: matched.reference,
      kind: "full",
    })
  }

  return entries
}

const getEncodedMarkerFromAnchor = (anchor: HTMLAnchorElement): string | null => {
  if (!anchor.title.startsWith(QUICK_QUOTE_MARKER_TITLE_PREFIX)) return null
  return anchor.title.slice(QUICK_QUOTE_MARKER_TITLE_PREFIX.length)
}

const isQuickQuoteMarkerAnchor = (anchor: HTMLAnchorElement): boolean => {
  if (getEncodedMarkerFromAnchor(anchor)) return true
  return (anchor.getAttribute("href") || "").includes(QUICK_QUOTE_MARKER_HREF)
}

function hasQuickQuoteMarkerResidue(element: Element): boolean {
  if (element.querySelector(`a[href*="${QUICK_QUOTE_MARKER_HREF}"]`)) return true

  const text = element.textContent || ""
  MARKER_MARKDOWN_RE.lastIndex = 0
  RENDERED_MARKER_MARKDOWN_RE.lastIndex = 0
  const hasResidue =
    text.includes(QUICK_QUOTE_MARKER_LABEL) ||
    MARKER_MARKDOWN_RE.test(text) ||
    RENDERED_MARKER_MARKDOWN_RE.test(text)
  MARKER_MARKDOWN_RE.lastIndex = 0
  RENDERED_MARKER_MARKDOWN_RE.lastIndex = 0
  return hasResidue
}

export const rememberQuickQuoteReferencesFromContent = (content: string): void => {
  const visibleContent = stripQuickQuoteMarkers(content)
  extractQuickQuoteMarkerEntriesFromText(content).forEach((entry) => {
    rememberQuickQuoteReference(
      visibleContent,
      pendingQuickQuoteReferenceById.get(entry.id) || entry.reference,
    )
  })
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
  extractQuickQuoteMarkerEntriesFromText(text).forEach(addEntry)

  return entries
}

export const removeQuickQuoteMarkerNodes = (element: Element): void => {
  element.querySelectorAll<HTMLAnchorElement>("a[href]").forEach((anchor) => {
    if (isQuickQuoteMarkerAnchor(anchor)) {
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
      node.parentElement?.closest(
        ".gh-root, .gh-main-panel, .gh-quick-quote-chip-row, .gh-quick-quote-chip",
      )
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
    const cleaned = stripQuickQuoteMarkersPreservingSpacing(node.data)
    if (cleaned !== node.data) {
      node.data = cleaned
    }
  })
}
