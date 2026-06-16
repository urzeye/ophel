import React, { useCallback, useEffect, useMemo, useRef, useState } from "react"

import type { SiteAdapter } from "~adapters/base"
import { MoreHorizontalIcon } from "~components/icons"
import { QuoteIcon, ReplyIcon } from "~components/icons/QuoteIcon"
import { VariableInputDialog } from "~components/VariableInputDialog"
import {
  buildPromptChainQueueInputs,
  buildPromptChainAutoValues,
  extractPromptChainVariables,
  resolvePromptChainSteps,
  type PromptChainSelectionContext,
} from "~core/prompt-chain-runner"
import type { PromptChain, PromptQuoteReference } from "~core/prompt-action-types"
import type { PromptManager } from "~core/prompt-manager"
import {
  appendQuickQuoteMarker,
  extractQuickQuoteMarkerEntriesFromElement,
  removeQuickQuoteMarkerNodes,
} from "~core/quick-quote-marker"
import { createPromptQuoteReference, scrollToQuoteReference } from "~core/quick-quote-utils"
import { usePromptChainsStore } from "~stores/prompt-chains-store"
import { usePromptsStore } from "~stores/prompts-store"
import { useQueueStore } from "~stores/queue-store"
import { useSettingsStore } from "~stores/settings-store"
import {
  DOMToolkit,
  OPHEL_INTERACTION_LAYER_SELECTOR,
  isEditableKeyboardTarget,
} from "~utils/dom-toolkit"
import { t } from "~utils/i18n"
import { formatMarkdownQuote, replaceVariables, type ParsedVariable } from "~utils/prompt-variables"
import { createSafeHTML } from "~utils/trusted-types"
import { showToast } from "~utils/toast"

interface QuickQuoteActionsProps {
  adapter: SiteAdapter
  promptManager: PromptManager
}

interface SelectionState {
  text: string
  range: Range
  rect: DOMRect
}

interface PendingChainRun {
  chain: PromptChain
  selection: PromptChainSelectionContext
  variables: ParsedVariable[]
}

const MAX_SELECTION_LENGTH = 8000
const POPOVER_MARGIN = 10
const QUICK_QUOTE_STYLE_ID = "gh-quick-quote-host-styles"
const QUICK_QUOTE_PRIMARY_CHAIN_LIMIT = 3

const isInsideOphel = (element: Element | null): boolean =>
  Boolean(element?.closest(".gh-root, .gh-main-panel, " + OPHEL_INTERACTION_LAYER_SELECTOR))

const isEditableElement = (element: HTMLElement): boolean => isEditableKeyboardTarget(element)

const getElementFromNode = (node: Node | null): HTMLElement | null => {
  if (!node) return null
  const element = node.nodeType === Node.ELEMENT_NODE ? (node as Element) : node.parentElement
  return element instanceof HTMLElement ? element : null
}

const isSelectionInConversation = (range: Range, adapter: SiteAdapter): boolean => {
  const element = getElementFromNode(range.commonAncestorContainer)
  if (!element) return false
  if (isInsideOphel(element)) return false
  if (isEditableElement(element)) return false
  if (element.closest("input, textarea, select, [contenteditable='true'], .ProseMirror"))
    return false

  const chatSelector = adapter.getChatContentSelectors().join(", ")
  if (chatSelector && element.closest(chatSelector)) return true

  const userQuerySelector = adapter.getUserQuerySelector()
  if (userQuerySelector && element.closest(userQuerySelector)) return true

  const responseSelector = adapter.getResponseContainerSelector()
  if (!responseSelector) return true

  return Array.from(document.querySelectorAll(responseSelector)).some((container) =>
    container.contains(element),
  )
}

const getSelectionRect = (range: Range): DOMRect | null => {
  const rects = Array.from(range.getClientRects()).filter(
    (rect) => rect.width > 0 && rect.height > 0,
  )
  return rects[rects.length - 1] || range.getBoundingClientRect() || null
}

const truncateText = (text: string, max = 72): string => {
  const normalized = text.replace(/\s+/g, " ").trim()
  return normalized.length > max ? `${normalized.slice(0, max)}...` : normalized
}

const SafeSvgIcon: React.FC<{ svg?: string; fallback: React.ReactNode }> = ({ svg, fallback }) => {
  if (!svg) return <>{fallback}</>
  return (
    <span
      className="gh-quick-quote-svg"
      dangerouslySetInnerHTML={{ __html: createSafeHTML(svg) }}
    />
  )
}

const LETTER_COLORS = [
  "#4285f4",
  "#ea4335",
  "#fbbc04",
  "#34a853",
  "#ff6d01",
  "#46bdc6",
  "#7b61ff",
  "#e91e63",
]

const ChainLetterFallback: React.FC<{ title: string }> = ({ title }) => {
  const letter = title.trim().charAt(0) || "C"
  let hash = 0
  for (let i = 0; i < title.length; i++) hash = title.charCodeAt(i) + ((hash << 5) - hash)
  const color = LETTER_COLORS[Math.abs(hash) % LETTER_COLORS.length]
  return (
    <span className="gh-quick-quote-letter" style={{ background: color }}>
      {letter}
    </span>
  )
}

const getReplyContent = (text: string) =>
  replaceVariables(t("quickQuoteReplyTemplate"), {
    selection: text,
    quote: formatMarkdownQuote(text),
  }).trim() + "\n\n"

const injectQuickQuoteHostStyles = (root: Document | ShadowRoot) => {
  if (root.querySelector(`#${QUICK_QUOTE_STYLE_ID}`)) return

  const style = document.createElement("style")
  style.id = QUICK_QUOTE_STYLE_ID
  style.textContent = `
    button.gh-quick-quote-chip {
      all: unset !important;
      box-sizing: border-box !important;
      display: inline-flex !important;
      align-items: center !important;
      gap: 6px !important;
      width: fit-content !important;
      max-width: min(360px, 100%) !important;
      margin: 0 0 8px !important;
      padding: 4px 8px !important;
      border: 1px solid rgba(66, 133, 244, 0.28) !important;
      border-radius: 8px !important;
      background: rgba(66, 133, 244, 0.07) !important;
      color: #2563eb !important;
      font: 500 12px/1.35 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif !important;
      letter-spacing: 0 !important;
      vertical-align: baseline !important;
      cursor: pointer !important;
      user-select: none !important;
    }
    button.gh-quick-quote-chip::before {
      content: "";
      width: 2px;
      height: 14px;
      flex: 0 0 2px;
      border-radius: 999px;
      background: rgba(66, 133, 244, 0.72);
    }
    button.gh-quick-quote-chip:hover {
      background: rgba(66, 133, 244, 0.12) !important;
      border-color: rgba(66, 133, 244, 0.45) !important;
      color: #1d4ed8 !important;
    }
    .gh-quick-quote-chip-text {
      min-width: 0 !important;
      overflow: hidden !important;
      text-overflow: ellipsis !important;
      white-space: nowrap !important;
    }
    .gh-quick-quote-source-highlight {
      outline: 2px solid rgba(66, 133, 244, 0.75) !important;
      outline-offset: 4px !important;
      animation: gh-quick-quote-source-pulse 2.4s ease;
    }
    ::highlight(gh-quick-quote-source-text) {
      background: rgba(66, 133, 244, 0.28);
      color: inherit;
    }
    @media (prefers-color-scheme: dark) {
      button.gh-quick-quote-chip {
        background: rgba(96, 165, 250, 0.13) !important;
        border-color: rgba(147, 197, 253, 0.34) !important;
        color: #bfdbfe !important;
      }
      button.gh-quick-quote-chip:hover {
        background: rgba(96, 165, 250, 0.2) !important;
        color: #dbeafe !important;
      }
      ::highlight(gh-quick-quote-source-text) {
        background: rgba(96, 165, 250, 0.34);
        color: inherit;
      }
    }
    @keyframes gh-quick-quote-source-pulse {
      0%, 100% { box-shadow: 0 0 0 rgba(66, 133, 244, 0); }
      30% { box-shadow: 0 0 0 8px rgba(66, 133, 244, 0.16); }
    }
  `

  if (root instanceof Document) {
    root.head.appendChild(style)
  } else {
    root.prepend(style)
  }
}

export const QuickQuoteRenderer: React.FC<{ adapter: SiteAdapter }> = ({ adapter }) => {
  const renderTimeoutRef = useRef<number | null>(null)
  const isRenderingRef = useRef(false)
  const quoteReferenceRegistryRef = useRef(new Map<string, PromptQuoteReference>())

  const renderReferenceChips = useCallback(() => {
    // 防止并发渲染
    if (isRenderingRef.current) return
    isRenderingRef.current = true

    try {
      const userQuerySelector = adapter.getUserQuerySelector()
      if (!userQuerySelector) return

      injectQuickQuoteHostStyles(document)

      const userMessages =
        (DOMToolkit.query(userQuerySelector, { all: true, shadow: true }) as Element[]) || []

      const markerEntriesByMessage = new Map<
        HTMLElement,
        ReturnType<typeof extractQuickQuoteMarkerEntriesFromElement>
      >()
      const quoteReferenceRegistry = quoteReferenceRegistryRef.current

      userMessages.forEach((message) => {
        if (!(message instanceof HTMLElement)) return

        const markerEntries = extractQuickQuoteMarkerEntriesFromElement(message)
        markerEntriesByMessage.set(message, markerEntries)
        markerEntries.forEach((entry) => {
          if (entry.reference) {
            quoteReferenceRegistry.set(entry.id, entry.reference)
          }
        })
      })

      userMessages.forEach((message) => {
        if (!(message instanceof HTMLElement)) return

        const renderedIds = new Set(
          (message.dataset.ghQuickQuoteRefs || "").split(",").filter(Boolean),
        )
        const markerEntries = markerEntriesByMessage.get(message) || []
        const markerReferences = markerEntries
          .map((entry) => entry.reference || quoteReferenceRegistry.get(entry.id))
          .filter((reference): reference is PromptQuoteReference => Boolean(reference))
        const hasUnresolvedRef = markerEntries.some(
          (entry) => !entry.reference && !quoteReferenceRegistry.has(entry.id),
        )
        if (!hasUnresolvedRef) {
          removeQuickQuoteMarkerNodes(message)
        }

        const referencesToRender = markerReferences.filter(
          (reference, index, source) =>
            !renderedIds.has(reference.id) &&
            source.findIndex((item) => item.id === reference.id) === index,
        )

        if (referencesToRender.length === 0) return

        const root = message.getRootNode()
        if (root instanceof Document || root instanceof ShadowRoot) {
          injectQuickQuoteHostStyles(root)
        }

        const fragment = document.createDocumentFragment()
        referencesToRender.forEach((reference) => {
          const chip = document.createElement("button")
          chip.type = "button"
          chip.className = "gh-quick-quote-chip"
          chip.title = t("quickQuoteJumpToSource")
          const label = document.createElement("span")
          label.className = "gh-quick-quote-chip-text"
          label.textContent = truncateText(reference.selectedText)
          chip.append(label)
          chip.addEventListener("click", (event) => {
            event.preventDefault()
            event.stopPropagation()
            const ok = scrollToQuoteReference(reference, adapter)
            if (!ok) showToast(t("quickQuoteSourceNotFound"), 2400)
          })

          fragment.append(chip)
          renderedIds.add(reference.id)
        })

        message.prepend(fragment)
        message.dataset.ghQuickQuoteRefs = Array.from(renderedIds).join(",")
      })
    } finally {
      isRenderingRef.current = false
    }
  }, [adapter])

  // 防抖渲染函数
  const debouncedRender = useCallback(() => {
    if (renderTimeoutRef.current !== null) {
      window.clearTimeout(renderTimeoutRef.current)
    }
    renderTimeoutRef.current = window.setTimeout(() => {
      renderTimeoutRef.current = null
      renderReferenceChips()
    }, 100)
  }, [renderReferenceChips])

  useEffect(() => {
    // 初始渲染
    renderReferenceChips()

    const target = document.querySelector(adapter.getResponseContainerSelector()) || document.body

    // 使用 MutationObserver 监听 DOM 变化
    const observer = new MutationObserver((mutations) => {
      // 只在有新增节点时触发
      const hasAddedNodes = mutations.some((mutation) => mutation.addedNodes.length > 0)
      if (hasAddedNodes) {
        debouncedRender()
      }
    })

    observer.observe(target, { childList: true, subtree: true })

    return () => {
      observer.disconnect()
      if (renderTimeoutRef.current !== null) {
        window.clearTimeout(renderTimeoutRef.current)
      }
    }
  }, [adapter, debouncedRender, renderReferenceChips])

  return null
}

export const QuickQuoteActions: React.FC<QuickQuoteActionsProps> = ({ adapter, promptManager }) => {
  const chains = usePromptChainsStore((state) => state.chains)
  const updateChainLastUsed = usePromptChainsStore((state) => state.updateLastUsed)
  const prompts = usePromptsStore((state) => state.prompts)
  const promptQueueEnabled = useSettingsStore(
    (state) => state.settings.features?.prompts?.promptQueue ?? false,
  )
  const updatePromptQueueSetting = useSettingsStore((state) => state.updateDeepSetting)
  const enqueueMany = useQueueStore((state) => state.enqueueMany)
  const [selectionState, setSelectionState] = useState<SelectionState | null>(null)
  const [pendingChainRun, setPendingChainRun] = useState<PendingChainRun | null>(null)
  const [chainMenuOpen, setChainMenuOpen] = useState(false)
  const [queueGateVisible, setQueueGateVisible] = useState(false)
  const isMouseSelectingRef = useRef(false)

  const visibleChains = useMemo(
    () =>
      chains
        .map((chain, index) => ({ chain, index }))
        .filter(({ chain }) => chain.showInSelectionPopover)
        .sort((a, b) => {
          const lastUsedDiff = (b.chain.lastUsedAt ?? 0) - (a.chain.lastUsedAt ?? 0)
          return lastUsedDiff || a.index - b.index
        })
        .map(({ chain }) => chain),
    [chains],
  )
  const primaryChains = visibleChains.slice(0, QUICK_QUOTE_PRIMARY_CHAIN_LIMIT)
  const overflowChains = visibleChains.slice(QUICK_QUOTE_PRIMARY_CHAIN_LIMIT)

  const clearSelection = useCallback(() => {
    setSelectionState(null)
    const selection = window.getSelection()
    selection?.removeAllRanges()
  }, [])

  const refreshSelection = useCallback(() => {
    const selection = window.getSelection()
    if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
      setSelectionState(null)
      return
    }

    const text = selection.toString().trim()
    if (!text || text.length > MAX_SELECTION_LENGTH) {
      setSelectionState(null)
      return
    }

    const range = selection.getRangeAt(0).cloneRange()
    if (!isSelectionInConversation(range, adapter)) {
      setSelectionState(null)
      return
    }

    const rect = getSelectionRect(range)
    if (!rect || rect.width === 0 || rect.height === 0) {
      setSelectionState(null)
      return
    }

    setSelectionState({ text, range, rect })
  }, [adapter])

  useEffect(() => {
    if (!selectionState || overflowChains.length === 0) {
      setChainMenuOpen(false)
    }
  }, [overflowChains.length, selectionState])

  useEffect(() => {
    if (!selectionState || promptQueueEnabled) {
      setQueueGateVisible(false)
    }
  }, [promptQueueEnabled, selectionState])

  useEffect(() => {
    const clearCollapsedSelection = () => {
      const selection = window.getSelection()
      if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
        setSelectionState(null)
      }
    }
    const hidePopover = () => setSelectionState(null)
    const handleMouseDown = (event: MouseEvent) => {
      if (event.button !== 0) return
      const target = event.target instanceof Element ? event.target : null
      if (isInsideOphel(target)) return
      isMouseSelectingRef.current = true
      setSelectionState(null)
    }
    const handleMouseUp = (event: MouseEvent) => {
      if (event.button !== 0 || !isMouseSelectingRef.current) return
      isMouseSelectingRef.current = false
      window.setTimeout(refreshSelection, 0)
    }
    const scheduleKeyboardRefresh = () => window.setTimeout(refreshSelection, 0)

    document.addEventListener("selectionchange", clearCollapsedSelection)
    document.addEventListener("mousedown", handleMouseDown)
    document.addEventListener("mouseup", handleMouseUp)
    document.addEventListener("keyup", scheduleKeyboardRefresh)
    window.addEventListener("scroll", hidePopover, true)
    window.addEventListener("resize", hidePopover)

    return () => {
      document.removeEventListener("selectionchange", clearCollapsedSelection)
      document.removeEventListener("mousedown", handleMouseDown)
      document.removeEventListener("mouseup", handleMouseUp)
      document.removeEventListener("keyup", scheduleKeyboardRefresh)
      window.removeEventListener("scroll", hidePopover, true)
      window.removeEventListener("resize", hidePopover)
    }
  }, [refreshSelection])

  const createSelectionContext = useCallback((): PromptChainSelectionContext | null => {
    if (!selectionState) return null
    const quoteRef = createPromptQuoteReference({
      selectedText: selectionState.text,
      adapter,
      range: selectionState.range,
    })

    return {
      selectedText: selectionState.text,
      quoteText: formatMarkdownQuote(selectionState.text),
      quoteRef: quoteRef || undefined,
    }
  }, [adapter, selectionState])

  const enablePromptQueue = useCallback(() => {
    updatePromptQueueSetting("features", "prompts", "promptQueue", true)
    setQueueGateVisible(false)
    showToast(t("chainQueueEnabledToast"), 1800)
  }, [updatePromptQueueSetting])

  const openPromptQueueSettings = useCallback(() => {
    setQueueGateVisible(false)
    window.dispatchEvent(
      new CustomEvent("ophel:navigateSettingsPage", {
        detail: { settingId: "prompt-queue" },
      }),
    )
  }, [])

  const handleQuote = useCallback(async () => {
    if (!selectionState) return

    const content = formatMarkdownQuote(selectionState.text) + "\n\n"
    const selection = createSelectionContext()
    const contentWithMarker = appendQuickQuoteMarker(content, selection?.quoteRef)
    const inserted = await promptManager.insertPrompt(contentWithMarker)
    if (!inserted) {
      showToast(t("insertFailed"))
      return
    }

    showToast(t("quickQuoteInserted"), 1800)
    clearSelection()
  }, [clearSelection, createSelectionContext, promptManager, selectionState])

  const handleInsertBuiltIn = useCallback(async () => {
    if (!selectionState) return

    const content = getReplyContent(selectionState.text)
    const selection = createSelectionContext()
    const contentWithMarker = appendQuickQuoteMarker(content, selection?.quoteRef)
    const inserted = await promptManager.insertPrompt(contentWithMarker)
    if (!inserted) {
      showToast(t("insertFailed"))
      return
    }

    showToast(t("quickQuoteInserted"), 1800)
    clearSelection()
  }, [clearSelection, createSelectionContext, promptManager, selectionState])

  const runChain = useCallback(
    async (
      chain: PromptChain,
      selection: PromptChainSelectionContext,
      values: Record<string, string>,
    ) => {
      const resolvedSteps = resolvePromptChainSteps({ chain, prompts, selection, values })
      if (resolvedSteps.length === 0) {
        showToast(t("promptEnqueueEmpty"), 2500)
        return
      }

      if (!promptQueueEnabled) {
        setQueueGateVisible(true)
        return
      }

      // 队列已开启：正常入队
      const queueInputs = buildPromptChainQueueInputs(chain, resolvedSteps)
      const items = enqueueMany(queueInputs)
      updateChainLastUsed(chain.id)
      showToast(t("quickQuoteChainQueued", { count: String(items.length) }), 2500)
      clearSelection()
    },
    [clearSelection, enqueueMany, promptQueueEnabled, prompts, updateChainLastUsed],
  )

  const handleRunChain = useCallback(
    (chain: PromptChain) => {
      if (!selectionState) return
      setChainMenuOpen(false)

      if (!promptQueueEnabled) {
        setQueueGateVisible(true)
        return
      }

      const selection = createSelectionContext()
      if (!selection) return

      const autoValues = buildPromptChainAutoValues(selection)
      const variables = extractPromptChainVariables(chain, prompts, autoValues)
      if (variables.length > 0) {
        setPendingChainRun({ chain, selection, variables })
        return
      }

      runChain(chain, selection, {})
    },
    [createSelectionContext, promptQueueEnabled, prompts, runChain, selectionState],
  )

  const popoverStyle = useMemo<React.CSSProperties>(() => {
    if (!selectionState) return {}
    const left = Math.min(
      window.innerWidth - POPOVER_MARGIN,
      Math.max(POPOVER_MARGIN, selectionState.rect.left + selectionState.rect.width / 2),
    )
    const top = Math.max(POPOVER_MARGIN, selectionState.rect.top - 48)
    return { left, top }
  }, [selectionState])

  if (!selectionState && !pendingChainRun) return <QuickQuoteRenderer adapter={adapter} />

  return (
    <>
      <QuickQuoteRenderer adapter={adapter} />
      {selectionState && (
        <div
          className="gh-quick-quote-popover gh-interactive"
          style={popoverStyle}
          onMouseDown={(event) => {
            event.preventDefault()
            event.stopPropagation()
          }}
          onKeyDown={(event) => {
            if (event.key === "Escape") setChainMenuOpen(false)
          }}>
          <button
            className="gh-quick-quote-action"
            title={t("quickQuoteQuote")}
            onClick={() => void handleQuote()}>
            <QuoteIcon size={15} />
            <span>{t("quickQuoteQuote")}</span>
          </button>
          <button
            className="gh-quick-quote-action"
            title={t("quickQuoteReply")}
            onClick={() => void handleInsertBuiltIn()}>
            <ReplyIcon size={15} />
            <span>{t("quickQuoteReply")}</span>
          </button>
          {primaryChains.length > 0 && <span className="gh-quick-quote-divider" />}
          {primaryChains.map((chain) => (
            <button
              key={chain.id}
              className="gh-quick-quote-action icon-only"
              title={chain.title}
              onClick={() => handleRunChain(chain)}>
              <SafeSvgIcon
                svg={chain.iconSvg}
                fallback={<ChainLetterFallback title={chain.title} />}
              />
              <span>{chain.title}</span>
            </button>
          ))}
          {overflowChains.length > 0 && (
            <span className="gh-quick-quote-more-wrap">
              <button
                type="button"
                className={`gh-quick-quote-action gh-quick-quote-more-trigger${
                  chainMenuOpen ? " active" : ""
                }`}
                title={`${t("floatingToolbarMore")} (${overflowChains.length})`}
                aria-haspopup="menu"
                aria-expanded={chainMenuOpen}
                onClick={() => setChainMenuOpen((open) => !open)}>
                <MoreHorizontalIcon size={15} />
                <span>+{overflowChains.length}</span>
              </button>
              {chainMenuOpen && (
                <div className="gh-quick-quote-more-menu" role="menu">
                  {overflowChains.map((chain) => (
                    <button
                      key={chain.id}
                      type="button"
                      className="gh-quick-quote-more-item"
                      title={chain.title}
                      role="menuitem"
                      onClick={() => handleRunChain(chain)}>
                      <SafeSvgIcon
                        svg={chain.iconSvg}
                        fallback={<ChainLetterFallback title={chain.title} />}
                      />
                      <span>{chain.title}</span>
                    </button>
                  ))}
                </div>
              )}
            </span>
          )}
          {queueGateVisible && (
            <div className="gh-quick-quote-queue-gate">
              <div className="gh-quick-quote-queue-gate-copy">
                <div className="gh-quick-quote-queue-gate-title">
                  {t("chainQueueRequiredTitle")}
                </div>
                <div className="gh-quick-quote-queue-gate-description">
                  {t("chainQueueRequiredDescription")}
                </div>
              </div>
              <div className="gh-quick-quote-queue-gate-actions">
                <button type="button" onClick={enablePromptQueue}>
                  {t("chainQueueEnable")}
                </button>
                <button type="button" onClick={openPromptQueueSettings}>
                  {t("chainQueueViewSettings")}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {pendingChainRun && (
        <VariableInputDialog
          variables={pendingChainRun.variables}
          onConfirm={(values) => {
            const { chain, selection } = pendingChainRun
            setPendingChainRun(null)
            runChain(chain, selection, values)
          }}
          onCancel={() => setPendingChainRun(null)}
        />
      )}
    </>
  )
}
