import type { SiteAdapter } from "~adapters/base"
import type { PromptQuoteReference, PromptSelectionAnchor } from "~core/prompt-action-types"
import { djb2ContentHash } from "~utils/content-hash"
import { formatMarkdownQuote } from "~utils/prompt-variables"

const CONTEXT_CHARS = 80
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

const getTextSignature = (text: string): string => text.replace(/\s+/g, " ").trim().slice(0, 120)

const normalizeText = (text: string): string => text.replace(/\s+/g, " ").trim()

const getRootIndex = (root: Element, adapter: SiteAdapter): number | undefined => {
  const selectors = adapter.getChatContentSelectors()
  if (selectors.length === 0) return undefined

  const container =
    document.querySelector(adapter.getResponseContainerSelector()) || adapter.getScrollContainer()
  const candidates = Array.from(
    (container || document).querySelectorAll(selectors.join(", ")),
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

  const rootText = (root.textContent || "").replace(/\s+/g, " ").trim()
  const normalizedSelection = selectedText.replace(/\s+/g, " ").trim()
  const selectionIndex = rootText.indexOf(normalizedSelection)
  const beforeText =
    selectionIndex >= 0
      ? rootText.slice(Math.max(0, selectionIndex - CONTEXT_CHARS), selectionIndex)
      : ""
  const afterText =
    selectionIndex >= 0
      ? rootText.slice(
          selectionIndex + normalizedSelection.length,
          selectionIndex + normalizedSelection.length + CONTEXT_CHARS,
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
    beforeText: getTextSignature(beforeText),
    afterText: getTextSignature(afterText),
    rootSelector,
    rootIndex: getRootIndex(root, adapter),
    rootTextSignature: getTextSignature(rootText),
    scrollTop: scrollContainer?.scrollTop,
    createdAt: Date.now(),
  }
}

export const createPromptQuoteReference = ({
  selectedText,
  adapter,
  range,
  content,
}: {
  selectedText: string
  adapter: SiteAdapter
  range: Range
  content?: string
}): PromptQuoteReference | null => {
  const anchor = createPromptSelectionAnchor({ range, selectedText, adapter })
  if (!anchor) return null

  const quoteText = formatMarkdownQuote(selectedText)
  return {
    id: `quote_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    selectedText,
    quoteText,
    anchor,
    consumerContentHash: content ? djb2ContentHash(content) : undefined,
    createdAt: Date.now(),
  }
}

const findRootByAnchor = (anchor: PromptSelectionAnchor, adapter: SiteAdapter): Element | null => {
  const container =
    document.querySelector(adapter.getResponseContainerSelector()) ||
    adapter.getScrollContainer() ||
    document

  if (anchor.rootSelector) {
    const target = container.querySelector(anchor.rootSelector)
    if (target) return target
  }

  const selectors = adapter.getChatContentSelectors()
  if (selectors.length === 0) return null

  const candidates = Array.from(container.querySelectorAll(selectors.join(", "))).filter(
    (candidate) => !candidate.closest(".gh-root, .gh-main-panel"),
  )

  if (anchor.rootIndex !== undefined && candidates[anchor.rootIndex]) {
    return candidates[anchor.rootIndex]
  }

  if (anchor.rootTextSignature) {
    return (
      candidates.find((candidate) =>
        getTextSignature(candidate.textContent || "").includes(anchor.rootTextSignature || ""),
      ) || null
    )
  }

  return null
}

const highlightElement = (element: HTMLElement): void => {
  element.classList.remove(HIGHLIGHT_CLASS)
  void element.offsetWidth
  element.classList.add(HIGHLIGHT_CLASS)
  window.setTimeout(() => element.classList.remove(HIGHLIGHT_CLASS), 2400)
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
  return Boolean(parent.closest(".gh-root, .gh-main-panel, .gh-quick-quote-chip"))
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
    if (preceding.endsWith(before)) score += 4
    else if (preceding.includes(before)) score += 2
  }

  if (after) {
    const following = text.slice(
      matchIndex + selectionLength,
      matchIndex + selectionLength + after.length + 40,
    )
    if (following.startsWith(after)) score += 4
    else if (following.includes(after)) score += 2
  }

  return score
}

const findTextRangeByAnchor = (root: Element, anchor: PromptSelectionAnchor): Range | null => {
  const selectedText = normalizeText(anchor.selectedText)
  if (!selectedText) return null

  const index = buildNormalizedTextIndex(root)
  const matches = findAllMatchIndexes(index.text, selectedText)
  if (matches.length === 0) return null

  const bestMatch = matches.reduce((best, match) => {
    const bestScore = scoreMatch(index.text, best, selectedText.length, anchor)
    const matchScore = scoreMatch(index.text, match, selectedText.length, anchor)
    return matchScore > bestScore ? match : best
  }, matches[0])
  const start = index.positions[bestMatch]
  const end = index.positions[bestMatch + selectedText.length - 1]
  if (!start || !end) return null

  const range = document.createRange()
  range.setStart(start.node, start.offset)
  range.setEnd(end.node, end.offset + 1)
  return range
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
  const root = findRootByAnchor(reference.anchor, adapter)
  if (!root) return false

  const target = root instanceof HTMLElement ? root : (root.parentElement as HTMLElement | null)
  if (!target) return false

  const textRange = findTextRangeByAnchor(root, reference.anchor)
  if (textRange) {
    scrollRangeIntoView(textRange, adapter)
    if (!highlightTextRange(textRange)) {
      const rangeElement = getRangeElement(textRange)
      if (rangeElement) highlightElement(rangeElement)
    }
    return true
  }

  target.scrollIntoView({ behavior: "smooth", block: "center" })
  highlightElement(target)
  return true
}
