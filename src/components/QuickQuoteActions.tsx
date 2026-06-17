import React, { useCallback, useEffect, useMemo, useRef, useState } from "react"

import type { QuickQuoteSupportMode, SiteAdapter } from "~adapters/base"
import { MoreHorizontalIcon } from "~components/icons"
import { QuoteIcon, ReplyIcon } from "~components/icons/QuoteIcon"
import { SafeSvgMarkup } from "~components/ui"
import { VariableInputDialog } from "~components/VariableInputDialog"
import { sendOrQueuePrompt } from "~core/prompt-actions"
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
  rememberQuickQuoteReferenceForContent,
  removeQuickQuoteMarkerNodes,
  resolvePendingQuickQuoteMarkerEntriesFromElement,
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
const QUICK_QUOTE_CHIP_ROW_SELECTOR = ".gh-quick-quote-chip-row"
const QUICK_QUOTE_CHIP_SELECTOR = "button.gh-quick-quote-chip"

const canUseOphelQuickQuote = (
  enabledSetting: boolean,
  adapterMode: QuickQuoteSupportMode,
): boolean => {
  if (!enabledSetting) return false
  // enabled 模式：完全启用 chips 和 popover
  if (adapterMode === "enabled") return true
  // native 模式：也启用 chips（用户主动使用 Ophel chain 时需要渲染锚点）
  // 虽然 native 站点有原生引用，但用户选择 Ophel chain 时，应该渲染 Ophel 的锚点
  if (adapterMode === "native") return true
  return false
}

const canUseQuickQuoteSelectionActions = (
  enabledSetting: boolean,
  adapterMode: QuickQuoteSupportMode,
  hasVisibleChains: boolean,
): boolean => {
  if (!enabledSetting) return false
  // enabled 模式：完全启用
  if (adapterMode === "enabled") return true
  // native 模式：有自定义 chains 时仍然显示（但会智能避让原生悬浮框）
  if (adapterMode === "native" && hasVisibleChains) return true
  return false
}

/**
 * 检查元素是否在视口中可见
 */
const isVisibleInViewport = (element: Element): boolean => {
  if (!(element instanceof HTMLElement)) return false
  const style = window.getComputedStyle(element)
  if (style.display === "none" || style.visibility === "hidden" || style.opacity === "0") {
    return false
  }
  const rect = element.getBoundingClientRect()
  return rect.width > 0 && rect.height > 0
}

const isInsideOphel = (element: Element | null): boolean =>
  Boolean(element?.closest(".gh-root, .gh-main-panel, " + OPHEL_INTERACTION_LAYER_SELECTOR))

/**
 * 计算 Ophel 悬浮框位置，智能避让原生悬浮框
 * @param rect 选区位置
 * @param adapter 站点适配器
 * @returns 悬浮框的 left 和 top 位置
 */
const calculatePopoverPosition = (
  rect: DOMRect,
  adapter: SiteAdapter,
): { left: number; top: number } => {
  const margin = POPOVER_MARGIN
  const defaultLeft = Math.min(
    window.innerWidth - margin,
    Math.max(margin, rect.left + rect.width / 2),
  )
  const defaultTop = Math.max(margin, rect.top - 48)

  // 仅在 native 模式下检测原生悬浮框
  const mode = adapter.getQuickQuoteSupportMode()
  if (mode !== "native") {
    return { left: defaultLeft, top: defaultTop }
  }

  // 查找原生悬浮框
  const nativeSelectors = adapter.getNativeQuotePopoverSelectors()
  if (nativeSelectors.length === 0) {
    return { left: defaultLeft, top: defaultTop }
  }

  let nativePopover: Element | null = null
  for (const selector of nativeSelectors) {
    const element = document.querySelector(selector)
    if (element && isVisibleInViewport(element)) {
      nativePopover = element
      break
    }
  }

  if (!nativePopover) {
    return { left: defaultLeft, top: defaultTop }
  }

  // 原生悬浮框存在，计算避让位置
  const nativeRect = nativePopover.getBoundingClientRect()

  // 策略 1: 如果原生悬浮框在选区上方，Ophel 放在选区下方
  if (nativeRect.bottom < rect.top) {
    return {
      left: defaultLeft,
      top: Math.min(window.innerHeight - margin - 48, rect.bottom + margin),
    }
  }

  // 策略 2: 如果原生悬浮框在选区下方，Ophel 放在选区上方
  if (nativeRect.top > rect.bottom) {
    return { left: defaultLeft, top: defaultTop }
  }

  // 策略 3: 如果原生悬浮框在选区左侧，Ophel 放在选区右侧
  if (nativeRect.right < rect.left) {
    return {
      left: Math.min(window.innerWidth - margin, rect.right + margin),
      top: Math.max(margin, rect.top),
    }
  }

  // 策略 4: 如果原生悬浮框在选区右侧，Ophel 放在选区左侧
  if (nativeRect.left > rect.right) {
    return {
      left: Math.max(margin, rect.left - 200), // 假设 Ophel 宽度约 200px
      top: Math.max(margin, rect.top),
    }
  }

  // 策略 5: 如果完全重叠，尝试放在右侧
  return {
    left: Math.min(window.innerWidth - margin, nativeRect.right + margin),
    top: Math.max(margin, rect.top),
  }
}

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

const findQuickQuoteChipHost = (message: HTMLElement, adapter: SiteAdapter): HTMLElement => {
  const host = adapter.getQuickQuoteChipHost(message)
  if (host instanceof HTMLElement && message.contains(host)) return host
  return message
}

const createQuickQuoteMessageScopeKey = (index: number, text: string): string => {
  const normalized = text.replace(/\s+/g, " ").trim()
  return `${index}:${normalized.length}:${normalized.slice(0, 120)}:${normalized.slice(-120)}`
}

const getQuickQuoteChipRow = (message: HTMLElement, host: HTMLElement): HTMLElement => {
  const existing = message.querySelector(QUICK_QUOTE_CHIP_ROW_SELECTOR)
  const row = existing instanceof HTMLElement ? existing : document.createElement("span")

  row.className = "gh-quick-quote-chip-row"

  if (row.parentElement !== host || host.firstElementChild !== row) {
    host.prepend(row)
  }

  return row
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
    .gh-quick-quote-chip-row {
      box-sizing: border-box !important;
      display: flex !important;
      align-items: center !important;
      justify-content: flex-start !important;
      flex-wrap: wrap !important;
      gap: 4px !important;
      width: fit-content !important;
      max-width: 100% !important;
      margin: 0 0 6px !important;
      padding: 0 !important;
      pointer-events: auto !important;
    }
    button.gh-quick-quote-chip {
      all: unset !important;
      box-sizing: border-box !important;
      display: inline-flex !important;
      align-items: center !important;
      gap: 6px !important;
      width: fit-content !important;
      max-width: min(360px, 100%) !important;
      margin: 0 !important;
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

export const QuickQuoteRenderer: React.FC<{ adapter: SiteAdapter; enabled: boolean }> = ({
  adapter,
  enabled,
}) => {
  const renderTimeoutRef = useRef<number | null>(null)
  const isRenderingRef = useRef(false)
  const quoteReferenceRegistryRef = useRef(new Map<string, PromptQuoteReference>())
  const knownUserMessageElementsRef = useRef(new WeakSet<HTMLElement>())
  const knownUserMessageKeysRef = useRef(new Set<string>())
  const hasRenderedOnceRef = useRef(false)
  const renderedSessionIdRef = useRef<string | null>(null)

  const removeRenderedChips = useCallback(() => {
    const userQuerySelector = adapter.getUserQuerySelector()
    if (!userQuerySelector) return

    const userMessages =
      (DOMToolkit.query(userQuerySelector, { all: true, shadow: true }) as Element[]) || []
    userMessages.forEach((message) => {
      if (!(message instanceof HTMLElement)) return
      message.querySelectorAll(QUICK_QUOTE_CHIP_ROW_SELECTOR).forEach((row) => row.remove())
      delete message.dataset.ghQuickQuoteRefs
    })
  }, [adapter])

  const resetRenderedState = useCallback(() => {
    removeRenderedChips()
    knownUserMessageElementsRef.current = new WeakSet<HTMLElement>()
    knownUserMessageKeysRef.current = new Set<string>()
    hasRenderedOnceRef.current = false
  }, [removeRenderedChips])

  const renderReferenceChips = useCallback(() => {
    if (!enabled) return
    // 防止并发渲染
    if (isRenderingRef.current) return
    isRenderingRef.current = true

    try {
      const userQuerySelector = adapter.getUserQuerySelector()
      if (!userQuerySelector) return

      const sessionId = adapter.getSessionId()
      const siteId = adapter.getSiteId()
      if (renderedSessionIdRef.current !== sessionId) {
        renderedSessionIdRef.current = sessionId
        knownUserMessageElementsRef.current = new WeakSet<HTMLElement>()
        knownUserMessageKeysRef.current = new Set<string>()
        quoteReferenceRegistryRef.current.clear()
        hasRenderedOnceRef.current = false
      }

      injectQuickQuoteHostStyles(document)

      const userMessages =
        (DOMToolkit.query(userQuerySelector, { all: true, shadow: true }) as Element[]) || []
      const knownElements = knownUserMessageElementsRef.current
      const knownKeys = knownUserMessageKeysRef.current
      const messageSnapshots: Array<{
        message: HTMLElement
        visibleText: string
        scopeKey: string
        isKnown: boolean
      }> = []

      userMessages.forEach((message, index) => {
        if (!(message instanceof HTMLElement)) return

        const visibleText = adapter.extractUserQueryText(message)
        const scopeKey = createQuickQuoteMessageScopeKey(
          index,
          visibleText || message.textContent || "",
        )
        messageSnapshots.push({
          message,
          visibleText,
          scopeKey,
          isKnown: knownElements.has(message) || knownKeys.has(scopeKey),
        })
      })

      const markerEntriesByMessage = new Map<
        HTMLElement,
        ReturnType<typeof extractQuickQuoteMarkerEntriesFromElement>
      >()
      const quoteReferenceRegistry = quoteReferenceRegistryRef.current
      const messageSnapshotsInReverse = [...messageSnapshots].reverse()

      messageSnapshotsInReverse.forEach(({ message, visibleText, scopeKey, isKnown }) => {
        const markerEntries = extractQuickQuoteMarkerEntriesFromElement(message)
        const fallbackEntries =
          markerEntries.length === 0
            ? resolvePendingQuickQuoteMarkerEntriesFromElement(message, visibleText, {
                allowMarkerlessMatch: hasRenderedOnceRef.current && !isKnown,
                currentSessionId: sessionId,
                currentSiteId: siteId,
                markerlessScopeKey: scopeKey,
              })
            : []
        const allMarkerEntries = [...markerEntries, ...fallbackEntries]
        markerEntriesByMessage.set(message, allMarkerEntries)
        allMarkerEntries.forEach((entry) => {
          if (entry.reference) {
            quoteReferenceRegistry.set(entry.id, entry.reference)
          }
        })
      })

      messageSnapshots.forEach(({ message }) => {
        const renderedIds = new Set(
          Array.from(message.querySelectorAll<HTMLButtonElement>(QUICK_QUOTE_CHIP_SELECTOR))
            .map((chip) => chip.dataset.ghQuickQuoteRefId)
            .filter((id): id is string => Boolean(id)),
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

        const existingChipRow = message.querySelector(QUICK_QUOTE_CHIP_ROW_SELECTOR)
        if (existingChipRow instanceof HTMLElement && renderedIds.size > 0) {
          getQuickQuoteChipRow(message, findQuickQuoteChipHost(message, adapter))
        }

        if (referencesToRender.length === 0) return

        const chipRow = getQuickQuoteChipRow(message, findQuickQuoteChipHost(message, adapter))

        const root = message.getRootNode()
        if (root instanceof Document || root instanceof ShadowRoot) {
          injectQuickQuoteHostStyles(root)
        }

        const fragment = document.createDocumentFragment()
        referencesToRender.forEach((reference) => {
          const chip = document.createElement("button")
          chip.type = "button"
          chip.className = "gh-quick-quote-chip"
          chip.dataset.ghQuickQuoteRefId = reference.id
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

        chipRow.append(fragment)
        message.dataset.ghQuickQuoteRefs = Array.from(renderedIds).join(",")
      })

      messageSnapshots.forEach(({ message, scopeKey }) => {
        knownElements.add(message)
        knownKeys.add(scopeKey)
      })
      hasRenderedOnceRef.current = true
    } finally {
      isRenderingRef.current = false
    }
  }, [adapter, enabled])

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
    if (!enabled) {
      resetRenderedState()
      return
    }

    // 初始渲染
    renderReferenceChips()

    const responseSelector = adapter.getResponseContainerSelector()
    const target =
      adapter.getObserveTarget() ||
      (responseSelector ? document.querySelector(responseSelector) : null) ||
      document.body

    // 使用 MutationObserver 监听 DOM 变化
    const observer = new MutationObserver((mutations) => {
      const shouldRender = mutations.some(
        (mutation) =>
          mutation.addedNodes.length > 0 ||
          mutation.type === "characterData" ||
          (mutation.type === "attributes" &&
            ["class", "style", "href", "title"].includes(mutation.attributeName || "")),
      )
      if (shouldRender) {
        debouncedRender()
      }
    })

    observer.observe(target, {
      attributes: true,
      attributeFilter: ["class", "style", "href", "title"],
      characterData: true,
      childList: true,
      subtree: true,
    })

    return () => {
      observer.disconnect()
      if (renderTimeoutRef.current !== null) {
        window.clearTimeout(renderTimeoutRef.current)
      }
    }
  }, [adapter, debouncedRender, enabled, renderReferenceChips, resetRenderedState])

  return null
}

export const QuickQuoteActions: React.FC<QuickQuoteActionsProps> = ({ adapter, promptManager }) => {
  const chains = usePromptChainsStore((state) => state.chains)
  const updateChainLastUsed = usePromptChainsStore((state) => state.updateLastUsed)
  const prompts = usePromptsStore((state) => state.prompts)
  const promptQueueEnabled = useSettingsStore(
    (state) => state.settings.features?.prompts?.promptQueue ?? false,
  )
  const quickQuoteEnabledSetting = useSettingsStore(
    (state) => state.settings.features?.prompts?.quickQuoteEnabled ?? true,
  )
  const submitShortcut = useSettingsStore(
    (state) => state.settings.features?.prompts?.submitShortcut ?? "enter",
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
  const quickQuoteSupportMode = useMemo(() => adapter.getQuickQuoteSupportMode(), [adapter])
  const quickQuoteEnabled = useMemo(
    () => canUseOphelQuickQuote(quickQuoteEnabledSetting, quickQuoteSupportMode),
    [quickQuoteEnabledSetting, quickQuoteSupportMode],
  )
  const selectionActionsEnabled = useMemo(
    () =>
      canUseQuickQuoteSelectionActions(
        quickQuoteEnabledSetting,
        quickQuoteSupportMode,
        visibleChains.length > 0,
      ),
    [quickQuoteEnabledSetting, quickQuoteSupportMode, visibleChains.length],
  )

  const clearSelection = useCallback(() => {
    setSelectionState(null)
    const selection = window.getSelection()
    selection?.removeAllRanges()
  }, [])

  const refreshSelection = useCallback(() => {
    if (!selectionActionsEnabled) {
      setSelectionState(null)
      return
    }

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

    // Native 模式：延迟显示 Ophel 悬浮框，给原生悬浮框优先渲染的机会
    const mode = adapter.getQuickQuoteSupportMode()
    if (mode === "native") {
      setTimeout(() => {
        // 再次检查选区是否仍然有效
        const currentSelection = window.getSelection()
        if (
          currentSelection &&
          !currentSelection.isCollapsed &&
          currentSelection.toString().trim() === text
        ) {
          setSelectionState({ text, range, rect })
        }
      }, 100)
    } else {
      setSelectionState({ text, range, rect })
    }
  }, [adapter, selectionActionsEnabled])

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
    if (!selectionActionsEnabled) {
      setSelectionState(null)
      setPendingChainRun(null)
      return
    }

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
  }, [refreshSelection, selectionActionsEnabled])

  const createSelectionContext = useCallback((): PromptChainSelectionContext | null => {
    if (!selectionState) return null
    const quoteRef = quickQuoteEnabled
      ? createPromptQuoteReference({
          selectedText: selectionState.text,
          adapter,
          range: selectionState.range,
        })
      : null

    return {
      selectedText: selectionState.text,
      quoteText: formatMarkdownQuote(selectionState.text),
      quoteRef: quoteRef || undefined,
    }
  }, [adapter, quickQuoteEnabled, selectionState])

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
    rememberQuickQuoteReferenceForContent(content, selection?.quoteRef)
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
    rememberQuickQuoteReferenceForContent(content, selection?.quoteRef)
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
        if (resolvedSteps.length !== 1) {
          setQueueGateVisible(true)
          return
        }

        const [resolvedStep] = resolvedSteps
        const content = resolvedStep.content.trim()
        if (!content) {
          showToast(t("promptEnqueueEmpty"), 2500)
          return
        }

        if (resolvedStep.step.runMode !== "send-or-queue") {
          rememberQuickQuoteReferenceForContent(content, resolvedStep.quoteRef)
          const contentWithMarker = appendQuickQuoteMarker(content, resolvedStep.quoteRef)
          const inserted = await promptManager.insertPrompt(contentWithMarker)
          if (!inserted) {
            showToast(t("insertFailed"))
            return
          }

          updateChainLastUsed(chain.id)
          showToast(t("quickQuoteInserted"), 1800)
          clearSelection()
          return
        }

        const result = await sendOrQueuePrompt({
          adapter,
          manager: promptManager,
          content,
          submitShortcut,
          context: {
            source: "quick-follow-up",
            prompt: resolvedStep.prompt,
            variables: {
              selectedText: selection.selectedText,
              quoteText: selection.quoteText,
              quoteRef: resolvedStep.quoteRef,
            },
          },
        })

        if (result.status === "insert-failed") {
          showToast(t("insertFailed"))
          return
        }

        if (result.status === "send-failed") {
          showToast(t("promptSendFailed"))
          return
        }

        updateChainLastUsed(chain.id)
        showToast(t("promptSent") + ": " + chain.title, 1800)
        clearSelection()
        return
      }

      // 队列已开启：正常入队
      const queueInputs = buildPromptChainQueueInputs(chain, resolvedSteps)
      const items = enqueueMany(queueInputs)
      updateChainLastUsed(chain.id)
      showToast(t("quickQuoteChainQueued", { count: String(items.length) }), 2500)
      clearSelection()
    },
    [
      adapter,
      clearSelection,
      enqueueMany,
      promptManager,
      promptQueueEnabled,
      prompts,
      submitShortcut,
      updateChainLastUsed,
    ],
  )

  const handleRunChain = useCallback(
    (chain: PromptChain) => {
      if (!selectionState) return
      setChainMenuOpen(false)

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
    [createSelectionContext, prompts, runChain, selectionState],
  )

  const popoverStyle = useMemo<React.CSSProperties>(() => {
    if (!selectionState) return {}
    const { left, top } = calculatePopoverPosition(selectionState.rect, adapter)
    return { left, top }
  }, [selectionState, adapter])

  // 动态调整位置以避让原生悬浮框（延迟检测）
  useEffect(() => {
    if (!selectionState) return
    const mode = adapter.getQuickQuoteSupportMode()
    if (mode !== "native") return

    const adjustPosition = () => {
      const nativeSelectors = adapter.getNativeQuotePopoverSelectors()
      if (nativeSelectors.length === 0) return

      let nativePopover: Element | null = null
      for (const selector of nativeSelectors) {
        const element = document.querySelector(selector)
        if (element && isVisibleInViewport(element)) {
          nativePopover = element
          break
        }
      }

      if (nativePopover) {
        // 检测到原生悬浮框，重新计算位置
        const popoverElement = document.querySelector(".gh-quick-quote-popover")
        if (popoverElement instanceof HTMLElement) {
          const { left, top } = calculatePopoverPosition(selectionState.rect, adapter)
          popoverElement.style.left = `${left}px`
          popoverElement.style.top = `${top}px`
        }
      }
    }

    // 延迟检测，给原生悬浮框渲染时间
    const timer = setTimeout(adjustPosition, 100)
    return () => clearTimeout(timer)
  }, [selectionState, adapter])

  if (!selectionState && !pendingChainRun) {
    return <QuickQuoteRenderer adapter={adapter} enabled={quickQuoteEnabled} />
  }

  return (
    <>
      <QuickQuoteRenderer adapter={adapter} enabled={quickQuoteEnabled} />
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
          {quickQuoteEnabled && (
            <>
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
            </>
          )}
          {quickQuoteEnabled && primaryChains.length > 0 && (
            <span className="gh-quick-quote-divider" />
          )}
          {primaryChains.map((chain) => (
            <button
              key={chain.id}
              className="gh-quick-quote-action icon-only"
              title={chain.title}
              onClick={() => handleRunChain(chain)}>
              <SafeSvgMarkup
                className="gh-quick-quote-svg"
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
                      <SafeSvgMarkup
                        className="gh-quick-quote-svg"
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
