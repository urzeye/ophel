import { useCallback, useEffect, useRef, useState, type MutableRefObject } from "react"

import { hasOphelInteractionLayer, isEditableKeyboardTarget } from "~utils/dom-toolkit"

type EdgeSnapSide = "left" | "right" | null
type PanelMode = "edge-snap" | "floating" | undefined

interface UseEdgePeekControllerOptions {
  edgeSnapState: EdgeSnapSide
  panelMode: PanelMode
  isPanelExpanded: boolean
  findUiElement: (selector: string) => HTMLElement | null
  getQueryRoots: () => Array<Element | ShadowRoot>
  isSettingsOpenRef: MutableRefObject<boolean>
}

const PANEL_SEARCH_INPUT_CLASSES = new Set([
  "outline-search-input",
  "conversations-search-input",
  "prompt-search-input",
])

const getFirstHtmlElementFromEvent = (event: Event): HTMLElement | null => {
  const target = event
    .composedPath()
    .find((node): node is HTMLElement => node instanceof HTMLElement)

  if (target) return target
  return event.target instanceof HTMLElement ? event.target : null
}

const getPanelSearchInputFromEvent = (event: KeyboardEvent): HTMLInputElement | null => {
  const input = event
    .composedPath()
    .find(
      (node): node is HTMLInputElement =>
        node instanceof HTMLInputElement &&
        Array.from(PANEL_SEARCH_INPUT_CLASSES).some((className) =>
          node.classList.contains(className),
        ),
    )

  return input ?? null
}

export function useEdgePeekController({
  edgeSnapState,
  panelMode,
  isPanelExpanded,
  findUiElement,
  getQueryRoots,
  isSettingsOpenRef,
}: UseEdgePeekControllerOptions) {
  const [isEdgePeeking, setIsEdgePeeking] = useState(false)
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const shortcutPeekTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isInteractionActiveRef = useRef(false)
  const isInputFocusedRef = useRef(false)
  // IME 组合输入期间（如中文候选框）保持面板展开，不因 focusout/指针离开缩回
  const isComposingRef = useRef(false)
  const suppressOverlayInitRef = useRef(false)
  const shouldSyncAfterOpenRef = useRef(false)
  const edgeSnapStateRef = useRef(edgeSnapState)
  const panelModeRef = useRef(panelMode)

  useEffect(() => {
    edgeSnapStateRef.current = edgeSnapState
    panelModeRef.current = panelMode
  }, [edgeSnapState, panelMode])

  const clearHideTimer = useCallback(() => {
    if (hideTimerRef.current) {
      clearTimeout(hideTimerRef.current)
      hideTimerRef.current = null
    }
  }, [])

  const cancelShortcutPeekTimer = useCallback(() => {
    if (shortcutPeekTimerRef.current) {
      clearTimeout(shortcutPeekTimerRef.current)
      shortcutPeekTimerRef.current = null
    }
  }, [])

  const showEdgePeek = useCallback(() => {
    setIsEdgePeeking(true)
  }, [])

  const hideEdgePeek = useCallback(() => {
    setIsEdgePeeking(false)
  }, [])

  const hasOpenEdgePeekOverlay = useCallback(
    () => hasOphelInteractionLayer(getQueryRoots()),
    [getQueryRoots],
  )

  const syncEdgePeekVisibility = useCallback(() => {
    if (!edgeSnapStateRef.current || panelModeRef.current !== "edge-snap") {
      return
    }

    if (
      isSettingsOpenRef.current ||
      isInteractionActiveRef.current ||
      isInputFocusedRef.current ||
      isComposingRef.current
    ) {
      return
    }

    if (hasOpenEdgePeekOverlay()) {
      return
    }

    const panel = findUiElement(".gh-main-panel")
    if (!panel) {
      return
    }

    setIsEdgePeeking(panel.matches(":hover"))
  }, [findUiElement, hasOpenEdgePeekOverlay, isSettingsOpenRef])

  const scheduleEdgePeekSync = useCallback(
    (delayMs: number = 0) => {
      clearHideTimer()

      hideTimerRef.current = setTimeout(() => {
        hideTimerRef.current = null
        syncEdgePeekVisibility()
      }, delayMs)
    },
    [clearHideTimer, syncEdgePeekVisibility],
  )

  const showEdgePeekFromShortcut = useCallback(() => {
    showEdgePeek()
    cancelShortcutPeekTimer()
    shortcutPeekTimerRef.current = setTimeout(() => {
      syncEdgePeekVisibility()
      shortcutPeekTimerRef.current = null
    }, 3000)
  }, [cancelShortcutPeekTimer, showEdgePeek, syncEdgePeekVisibility])

  const markSuppressOverlayInit = useCallback((shouldSuppress: boolean = true) => {
    suppressOverlayInitRef.current = shouldSuppress
  }, [])

  const markSyncAfterOpen = useCallback(() => {
    shouldSyncAfterOpenRef.current = true
  }, [])

  const handleInteractionChange = useCallback((isActive: boolean) => {
    isInteractionActiveRef.current = isActive
  }, [])

  const handlePanelMouseEnter = useCallback(() => {
    clearHideTimer()
    cancelShortcutPeekTimer()

    if (edgeSnapState && panelMode === "edge-snap" && !isEdgePeeking) {
      showEdgePeek()
    }
  }, [
    cancelShortcutPeekTimer,
    clearHideTimer,
    edgeSnapState,
    isEdgePeeking,
    panelMode,
    showEdgePeek,
  ])

  const handlePanelMouseLeave = useCallback(() => {
    clearHideTimer()

    hideTimerRef.current = setTimeout(() => {
      if (isSettingsOpenRef.current) return
      if (isInputFocusedRef.current) return
      if (isComposingRef.current) return
      syncEdgePeekVisibility()
    }, 200)
  }, [clearHideTimer, isSettingsOpenRef, syncEdgePeekVisibility])

  useEffect(() => {
    return () => {
      clearHideTimer()
      cancelShortcutPeekTimer()
    }
  }, [cancelShortcutPeekTimer, clearHideTimer])

  useEffect(() => {
    if (!edgeSnapState || panelMode !== "edge-snap") return

    const checkPortalExists = () => hasOpenEdgePeekOverlay()
    let previousHasPortal = checkPortalExists()

    const observer = new MutationObserver(() => {
      const hasPortal = checkPortalExists()

      if (hasPortal && !previousHasPortal) {
        showEdgePeek()
        clearHideTimer()
      } else if (!hasPortal && previousHasPortal) {
        scheduleEdgePeekSync(500)
      }

      previousHasPortal = hasPortal
    })

    for (const root of getQueryRoots()) {
      observer.observe(root, {
        childList: true,
        subtree: root !== document.body,
      })
    }

    if (suppressOverlayInitRef.current) {
      suppressOverlayInitRef.current = false
    } else if (checkPortalExists()) {
      showEdgePeek()
    }

    return () => {
      observer.disconnect()
      suppressOverlayInitRef.current = false
    }
  }, [
    clearHideTimer,
    edgeSnapState,
    getQueryRoots,
    hasOpenEdgePeekOverlay,
    panelMode,
    scheduleEdgePeekSync,
    showEdgePeek,
  ])

  useEffect(() => {
    if (!edgeSnapState || panelMode !== "edge-snap") return

    const shadowRoots = getQueryRoots().filter(
      (root): root is ShadowRoot => root instanceof ShadowRoot,
    )
    if (shadowRoots.length === 0) return

    const handleFocusIn = (event: Event) => {
      const target = getFirstHtmlElementFromEvent(event)
      if (!target || !isEditableKeyboardTarget(target)) return

      if (target.closest(".settings-modal-overlay, .settings-modal")) {
        return
      }

      isInputFocusedRef.current = true
      showEdgePeek()
      clearHideTimer()
    }

    const handleFocusOut = (event: Event) => {
      const target = getFirstHtmlElementFromEvent(event)
      if (!target || !isEditableKeyboardTarget(target)) return

      if (target.closest(".settings-modal-overlay, .settings-modal")) {
        return
      }

      // IME 组合输入（中文候选框）引发的 focusout 不算真正失焦
      if (isComposingRef.current) return

      isInputFocusedRef.current = false
      clearHideTimer()
      hideTimerRef.current = setTimeout(() => {
        if (
          !isInputFocusedRef.current &&
          !isSettingsOpenRef.current &&
          !isInteractionActiveRef.current
        ) {
          syncEdgePeekVisibility()
        }
      }, 300)
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return

      const panelSearchInput = getPanelSearchInputFromEvent(event)
      if (!panelSearchInput) return

      event.preventDefault()
      event.stopImmediatePropagation()
      isInputFocusedRef.current = false
      panelSearchInput.blur()
      window.setTimeout(syncEdgePeekVisibility, 0)
    }

    const handleCompositionStart = () => {
      isComposingRef.current = true
      clearHideTimer()
    }

    const handleCompositionEnd = () => {
      isComposingRef.current = false
      // 组合结束后再按真实焦点状态同步一次
      scheduleEdgePeekSync(300)
    }

    shadowRoots.forEach((shadowRoot) => {
      shadowRoot.addEventListener("focusin", handleFocusIn, true)
      shadowRoot.addEventListener("focusout", handleFocusOut, true)
      shadowRoot.addEventListener("keydown", handleKeyDown, true)
      shadowRoot.addEventListener("compositionstart", handleCompositionStart, true)
      shadowRoot.addEventListener("compositionend", handleCompositionEnd, true)
    })

    return () => {
      shadowRoots.forEach((shadowRoot) => {
        shadowRoot.removeEventListener("focusin", handleFocusIn, true)
        shadowRoot.removeEventListener("focusout", handleFocusOut, true)
        shadowRoot.removeEventListener("keydown", handleKeyDown, true)
        shadowRoot.removeEventListener("compositionstart", handleCompositionStart, true)
        shadowRoot.removeEventListener("compositionend", handleCompositionEnd, true)
      })
    }
  }, [
    clearHideTimer,
    edgeSnapState,
    getQueryRoots,
    isSettingsOpenRef,
    panelMode,
    scheduleEdgePeekSync,
    showEdgePeek,
    syncEdgePeekVisibility,
  ])

  useEffect(() => {
    if (!shouldSyncAfterOpenRef.current) return
    if (!isPanelExpanded || !edgeSnapState || panelMode !== "edge-snap") return
    shouldSyncAfterOpenRef.current = false
    scheduleEdgePeekSync(1500)
  }, [edgeSnapState, isPanelExpanded, panelMode, scheduleEdgePeekSync])

  return {
    isEdgePeeking,
    showEdgePeek,
    hideEdgePeek,
    syncEdgePeekVisibility,
    scheduleEdgePeekSync,
    showEdgePeekFromShortcut,
    markSuppressOverlayInit,
    markSyncAfterOpen,
    handlePanelMouseEnter,
    handlePanelMouseLeave,
    handleInteractionChange,
  }
}
