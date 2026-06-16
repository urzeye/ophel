import type { SiteAdapter } from "~adapters/base"
import type { PromptQuoteReference, PromptSelectionAnchor } from "~core/prompt-action-types"
import { formatMarkdownQuote } from "~utils/prompt-variables"

const CONTEXT_CHARS = 40
const CONTEXT_CHARS_SHORT_TEXT = 80 // For short selections, use more context
const SHORT_TEXT_THRESHOLD = 20 // Text shorter than this is considered "short"
const HIGHLIGHT_CLASS = "gh-quick-quote-source-highlight"
const TEXT_HIGHLIGHT_NAME = "gh-quick-quote-source-text"

let textHighlightTimer: number | null = null

const getElementFromNode = (node: Node | null): Element | null => {
  if (!node) return null
  return node.nodeType === Node.ELEMENT_NODE ? (node as Element) : node.parentElement
}

const escapeAttr = (value: string): string => {
  if (typeof CSS !== "undefined" && typeof CSS.escape === "function") {
    return CSS.escape(value)
  }
  return value.replace(/["\\]/g, "\\$&")
}

const getTextSignature = (text: string): string => text.replace(/\s+/g, " ").trim().slice(0, 60)

const normalizeText = (text: string): string => text.replace(/\s+/g, " ").trim()

const getTextSuffixSignature = (text: string): string => {
  const normalized = normalizeText(text)
  return normalized.slice(Math.max(0, normalized.length - 60))
}

const getTextHash = (text: string): string => {
  let hash = 2166136261
  for (const char of normalizeText(text)) {
    hash ^= char.codePointAt(0) || 0
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0).toString(36)
}

const getConversationSearchRoot = (adapter: SiteAdapter): ParentNode => {
  const responseSelector = adapter.getResponseContainerSelector()
  return (
    adapter.getScrollContainer() ||
    (responseSelector ? document.querySelector(responseSelector) : null) ||
    document
  )
}

interface TextPosition {
  node: Text
  offset: number
}

interface TextIndex {
  text: string
  positions: TextPosition[]
}

const shouldSkipTextNode = (node: Text): boolean => {
  const parent = node.parentElement
  if (!parent) return true
  return Boolean(
    parent.closest(".gh-root, .gh-main-panel, .gh-quick-quote-chip-row, .gh-quick-quote-chip"),
  )
}

const buildNormalizedTextIndex = (root: Element): TextIndex => {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode: (node) =>
      node instanceof Text && !shouldSkipTextNode(node)
        ? NodeFilter.FILTER_ACCEPT
        : NodeFilter.FILTER_REJECT,
  })
  const positions: TextPosition[] = []
  let text = ""
  let lastWasSpace = true
  let current = walker.nextNode()

  while (current) {
    const node = current as Text
    for (let index = 0; index < node.data.length; index += 1) {
      const char = node.data[index]
      if (/\s/.test(char)) {
        if (text.length > 0 && !lastWasSpace) {
          text += " "
          positions.push({ node, offset: index })
          lastWasSpace = true
        }
        continue
      }

      text += char
      positions.push({ node, offset: index })
      lastWasSpace = false
    }
    current = walker.nextNode()
  }

  while (text.endsWith(" ")) {
    text = text.slice(0, -1)
    positions.pop()
  }

  return { text, positions }
}

const findSelectionIndexInRoot = (
  textIndex: TextIndex,
  range: Range,
  normalizedSelection: string,
): number => {
  let firstInRange = -1
  let lastInRange = -1

  for (let index = 0; index < textIndex.positions.length; index += 1) {
    const position = textIndex.positions[index]
    try {
      if (range.isPointInRange(position.node, position.offset)) {
        if (firstInRange < 0) firstInRange = index
        lastInRange = index
      }
    } catch {
      // Ignore detached or cross-root points; fall back to text search below.
    }
  }

  if (firstInRange >= 0 && lastInRange >= firstInRange) {
    const selectedSlice = textIndex.text.slice(firstInRange, lastInRange + 1)
    const offsetInSlice = selectedSlice.indexOf(normalizedSelection)
    return offsetInSlice >= 0 ? firstInRange + offsetInSlice : firstInRange
  }

  return textIndex.text.indexOf(normalizedSelection)
}

const getRootIndex = (root: Element, adapter: SiteAdapter): number | undefined => {
  const selectors = adapter.getChatContentSelectors()
  if (selectors.length === 0) return undefined

  const candidates = Array.from(
    getConversationSearchRoot(adapter).querySelectorAll(selectors.join(", ")),
  ).filter((candidate) => !candidate.closest(".gh-root, .gh-main-panel"))

  const index = candidates.indexOf(root)
  return index >= 0 ? index : undefined
}

export const findSelectionMessageRoot = (range: Range, adapter: SiteAdapter): Element | null => {
  const start = getElementFromNode(range.startContainer)
  if (!start) return null

  const selectors = adapter.getChatContentSelectors()
  const selector = selectors.join(", ")
  if (selector) {
    const closest = start.closest(selector)
    if (closest) return closest
  }

  const userQuerySelector = adapter.getUserQuerySelector()
  if (userQuerySelector) {
    const closestUserQuery = start.closest(userQuerySelector)
    if (closestUserQuery) return closestUserQuery
  }

  return start
}

export const createPromptSelectionAnchor = ({
  range,
  selectedText,
  adapter,
}: {
  range: Range
  selectedText: string
  adapter: SiteAdapter
}): PromptSelectionAnchor | null => {
  const root = findSelectionMessageRoot(range, adapter)
  if (!root) return null

  const textIndex = buildNormalizedTextIndex(root)
  const rootText = textIndex.text
  const normalizedSelection = normalizeText(selectedText)
  const selectionIndex = findSelectionIndexInRoot(textIndex, range, normalizedSelection)

  // Use longer context for short text to improve matching accuracy
  const contextChars =
    selectedText.length < SHORT_TEXT_THRESHOLD ? CONTEXT_CHARS_SHORT_TEXT : CONTEXT_CHARS

  const beforeText =
    selectionIndex >= 0
      ? rootText.slice(Math.max(0, selectionIndex - contextChars), selectionIndex)
      : ""
  const afterText =
    selectionIndex >= 0
      ? rootText.slice(
          selectionIndex + normalizedSelection.length,
          selectionIndex + normalizedSelection.length + contextChars,
        )
      : ""

  const messageId =
    root.getAttribute("data-message-id") ||
    root.closest("[data-message-id]")?.getAttribute("data-message-id") ||
    root.id ||
    ""

  const rootSelector = messageId
    ? root.id === messageId
      ? `#${escapeAttr(messageId)}`
      : `[data-message-id="${escapeAttr(messageId)}"]`
    : undefined

  const scrollContainer = adapter.getScrollContainer()

  return {
    siteId: adapter.getSiteId(),
    sessionId: adapter.getSessionId(),
    cid: adapter.getCurrentCid() || undefined,
    selectedText,
    textSignature: getTextSignature(selectedText),
    selectedPrefix: getTextSignature(normalizedSelection),
    selectedSuffix: getTextSuffixSignature(normalizedSelection),
    selectedLength: normalizedSelection.length,
    selectedHash: getTextHash(normalizedSelection),
    beforeText: getTextSignature(beforeText),
    afterText: getTextSignature(afterText),
    rootSelector,
    rootIndex: getRootIndex(root, adapter),
    rootTextSignature: getTextSignature(rootText),
    selectionIndex: selectionIndex >= 0 ? selectionIndex : undefined,
    scrollTop: scrollContainer?.scrollTop,
    createdAt: Date.now(),
  }
}

export const createPromptQuoteReference = ({
  selectedText,
  adapter,
  range,
}: {
  selectedText: string
  adapter: SiteAdapter
  range: Range
}): PromptQuoteReference | null => {
  const anchor = createPromptSelectionAnchor({ range, selectedText, adapter })
  if (!anchor) return null

  const quoteText = formatMarkdownQuote(selectedText)
  return {
    id: `quote_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    selectedText,
    quoteText,
    anchor,
    createdAt: Date.now(),
  }
}

interface TextMatch {
  range: Range
  score: number
  matchIndex: number
  matchCount: number
}

interface AnchorTarget {
  root: Element
  textMatch: TextMatch | null
  score: number
}

const getRootText = (root: Element): string => normalizeText(root.textContent || "")

const rootMatchesSignature = (rootText: string, signature?: string): boolean => {
  const normalizedSignature = normalizeText(signature || "")
  return Boolean(normalizedSignature) && rootText.includes(normalizedSignature)
}

const collectRootCandidates = (
  anchor: PromptSelectionAnchor,
  adapter: SiteAdapter,
): Map<Element, number> => {
  const container = getConversationSearchRoot(adapter)
  const candidates = new Map<Element, number>()

  const addCandidate = (candidate: Element | null | undefined, score: number) => {
    if (!candidate || candidate.closest(".gh-root, .gh-main-panel")) return
    candidates.set(candidate, Math.max(candidates.get(candidate) || 0, score))
  }

  if (anchor.rootSelector) {
    const target = container.querySelector(anchor.rootSelector)
    addCandidate(target, 40)
  }

  const selectors = adapter.getChatContentSelectors()
  if (selectors.length === 0) return candidates

  const roots = Array.from(container.querySelectorAll(selectors.join(", "))).filter(
    (candidate) => !candidate.closest(".gh-root, .gh-main-panel"),
  )

  roots.forEach((candidate, index) => {
    const rootText = getRootText(candidate)
    const rootSignatureMatches = rootMatchesSignature(rootText, anchor.rootTextSignature)

    if (anchor.rootIndex !== undefined && index === anchor.rootIndex) {
      addCandidate(candidate, rootSignatureMatches ? 18 : 4)
    }

    if (rootSignatureMatches) {
      addCandidate(candidate, 14)
    }

    const selectedText = normalizeText(
      anchor.selectedPrefix || anchor.textSignature || anchor.selectedText,
    )
    if (selectedText && rootText.includes(selectedText)) {
      addCandidate(candidate, 8)
    }
  })

  return candidates
}

const scoreRootCandidate = (root: Element, anchor: PromptSelectionAnchor, sourceScore: number) => {
  const rootText = getRootText(root)
  let score = sourceScore

  if (rootMatchesSignature(rootText, anchor.rootTextSignature)) score += 10
  if (rootMatchesSignature(rootText, anchor.selectedPrefix || anchor.textSignature)) score += 4
  if (rootMatchesSignature(rootText, anchor.beforeText)) score += 3
  if (rootMatchesSignature(rootText, anchor.afterText)) score += 3

  return score
}

const findTargetByAnchor = (
  anchor: PromptSelectionAnchor,
  adapter: SiteAdapter,
): AnchorTarget | null => {
  const candidates = collectRootCandidates(anchor, adapter)
  let best: AnchorTarget | null = null

  candidates.forEach((sourceScore, root) => {
    const textMatch = findTextMatchByAnchor(root, anchor)
    const rootScore = scoreRootCandidate(root, anchor, sourceScore)
    const score = rootScore + (textMatch ? 20 + textMatch.score : 0)

    if (!best || score > best.score) {
      best = { root, textMatch, score }
    }
  })

  return best && best.score >= 18 ? best : null
}

const highlightElement = (element: HTMLElement): void => {
  element.classList.remove(HIGHLIGHT_CLASS)
  void element.offsetWidth
  element.classList.add(HIGHLIGHT_CLASS)
  window.setTimeout(() => element.classList.remove(HIGHLIGHT_CLASS), 2400)
}

const findAllMatchIndexes = (text: string, needle: string): number[] => {
  const indexes: number[] = []
  if (!needle) return indexes

  let fromIndex = 0
  while (fromIndex < text.length) {
    const index = text.indexOf(needle, fromIndex)
    if (index === -1) break
    indexes.push(index)
    fromIndex = index + Math.max(needle.length, 1)
  }

  return indexes
}

const scoreMatch = (
  text: string,
  matchIndex: number,
  selectionLength: number,
  anchor: PromptSelectionAnchor,
): number => {
  let score = 0
  const before = normalizeText(anchor.beforeText || "")
  const after = normalizeText(anchor.afterText || "")

  if (before) {
    const preceding = text.slice(Math.max(0, matchIndex - before.length - 40), matchIndex)
    if (preceding.endsWith(before)) score += 8
    else if (preceding.includes(before)) score += 4
  }

  if (after) {
    const following = text.slice(
      matchIndex + selectionLength,
      matchIndex + selectionLength + after.length + 40,
    )
    if (following.startsWith(after)) score += 8
    else if (following.includes(after)) score += 4
  }

  if (anchor.selectionIndex !== undefined) {
    const distance = Math.abs(matchIndex - anchor.selectionIndex)
    if (distance === 0) score += 4
    else if (distance <= 24) score += 2
    else if (distance <= 120) score += 1
  }

  return score
}

const findTextMatchByAnchor = (root: Element, anchor: PromptSelectionAnchor): TextMatch | null => {
  const selectedText = normalizeText(anchor.selectedText)
  const selectionLength =
    anchor.selectedLength && anchor.selectedLength > 0 ? anchor.selectedLength : selectedText.length
  if (selectionLength <= 0) return null

  const index = buildNormalizedTextIndex(root)
  const exactNeedle = selectedText.length === selectionLength ? selectedText : ""
  const prefix = normalizeText(anchor.selectedPrefix || anchor.textSignature || exactNeedle)
  const suffix = normalizeText(anchor.selectedSuffix || "")
  const candidateIndexes = new Set<number>()

  if (exactNeedle) {
    findAllMatchIndexes(index.text, exactNeedle).forEach((matchIndex) =>
      candidateIndexes.add(matchIndex),
    )
  } else if (prefix) {
    findAllMatchIndexes(index.text, prefix).forEach((matchIndex) =>
      candidateIndexes.add(matchIndex),
    )
  }

  if (anchor.selectionIndex !== undefined) {
    candidateIndexes.add(anchor.selectionIndex)
  }

  const matches = Array.from(candidateIndexes).filter(
    (matchIndex) => matchIndex >= 0 && matchIndex + selectionLength <= index.text.length,
  )
  if (matches.length === 0) return null

  const scoreCandidate = (matchIndex: number): number => {
    const selectedSlice = index.text.slice(matchIndex, matchIndex + selectionLength)
    let score = scoreMatch(index.text, matchIndex, selectionLength, anchor)

    if (anchor.selectedHash) {
      if (getTextHash(selectedSlice) !== anchor.selectedHash) return Number.NEGATIVE_INFINITY
      score += 12
    }

    if (exactNeedle && selectedSlice === exactNeedle) {
      score += 10
    }

    if (prefix) {
      if (!selectedSlice.startsWith(prefix)) return Number.NEGATIVE_INFINITY
      score += 6
    }

    if (suffix) {
      if (!selectedSlice.endsWith(suffix)) return Number.NEGATIVE_INFINITY
      score += 6
    }

    return score
  }

  const bestMatch = matches.reduce((best, match) => {
    const bestScore = scoreCandidate(best)
    const matchScore = scoreCandidate(match)
    return matchScore > bestScore ? match : best
  }, matches[0])

  const bestScore = scoreCandidate(bestMatch)
  if (!Number.isFinite(bestScore)) return null

  const start = index.positions[bestMatch]
  const end = index.positions[bestMatch + selectionLength - 1]
  if (!start || !end) return null

  const range = document.createRange()
  range.setStart(start.node, start.offset)
  range.setEnd(end.node, end.offset + 1)
  return {
    range,
    score: bestScore,
    matchIndex: bestMatch,
    matchCount: matches.length,
  }
}

const getRangeElement = (range: Range): HTMLElement | null => {
  const node = range.startContainer
  const element = node.nodeType === Node.ELEMENT_NODE ? (node as Element) : node.parentElement
  return element instanceof HTMLElement ? element : null
}

const scrollRangeIntoView = (range: Range, adapter: SiteAdapter): void => {
  const rect = range.getBoundingClientRect()
  const scrollContainer = adapter.getScrollContainer()

  if (
    scrollContainer instanceof HTMLElement &&
    rect.width > 0 &&
    rect.height > 0 &&
    scrollContainer.contains(getRangeElement(range))
  ) {
    const containerRect = scrollContainer.getBoundingClientRect()
    const top =
      scrollContainer.scrollTop +
      rect.top -
      containerRect.top -
      containerRect.height / 2 +
      rect.height / 2
    scrollContainer.scrollTo({ top, behavior: "smooth" })
    return
  }

  getRangeElement(range)?.scrollIntoView({ behavior: "smooth", block: "center" })
}

const highlightTextRange = (range: Range): boolean => {
  const highlightCtor = (
    window as unknown as {
      Highlight?: new (...ranges: Range[]) => unknown
    }
  ).Highlight
  const highlights = (
    CSS as unknown as {
      highlights?: {
        set: (name: string, highlight: unknown) => void
        delete: (name: string) => void
      }
    }
  ).highlights

  if (!highlightCtor || !highlights) return false

  if (textHighlightTimer !== null) {
    window.clearTimeout(textHighlightTimer)
    textHighlightTimer = null
  }

  highlights.delete(TEXT_HIGHLIGHT_NAME)
  highlights.set(TEXT_HIGHLIGHT_NAME, new highlightCtor(range.cloneRange()))
  textHighlightTimer = window.setTimeout(() => {
    highlights.delete(TEXT_HIGHLIGHT_NAME)
    textHighlightTimer = null
  }, 2400)
  return true
}

export const scrollToQuoteReference = (
  reference: PromptQuoteReference,
  adapter: SiteAdapter,
): boolean => {
  const target = findTargetByAnchor(reference.anchor, adapter)
  if (!target) return false

  const rootElement =
    target.root instanceof HTMLElement
      ? target.root
      : (target.root.parentElement as HTMLElement | null)
  if (!rootElement) return false

  if (target.textMatch) {
    scrollRangeIntoView(target.textMatch.range, adapter)
    if (!highlightTextRange(target.textMatch.range)) {
      const rangeElement = getRangeElement(target.textMatch.range)
      if (rangeElement) highlightElement(rangeElement)
    }
    return true
  }

  rootElement.scrollIntoView({ behavior: "smooth", block: "center" })
  highlightElement(rootElement)
  return true
}
