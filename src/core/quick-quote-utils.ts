import type { SiteAdapter } from "~adapters/base"
import type { PromptQuoteReference, PromptSelectionAnchor } from "~core/prompt-action-types"
import { djb2ContentHash } from "~utils/content-hash"
import { formatMarkdownQuote } from "~utils/prompt-variables"

const CONTEXT_CHARS = 80
const HIGHLIGHT_CLASS = "gh-quick-quote-source-highlight"

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

export const scrollToQuoteReference = (
  reference: PromptQuoteReference,
  adapter: SiteAdapter,
): boolean => {
  const root = findRootByAnchor(reference.anchor, adapter)
  if (!root) return false

  const target = root instanceof HTMLElement ? root : (root.parentElement as HTMLElement | null)
  if (!target) return false

  target.scrollIntoView({ behavior: "smooth", block: "center" })
  highlightElement(target)
  return true
}
