import { useCallback, useEffect, useRef, useState, type MutableRefObject } from "react"

import { hasOphelEdgePeekOverlay, isEditableKeyboardTarget } from "~utils/dom-toolkit"
import { resolveWindowExitSide, WINDOW_EXIT_HOLD_MS } from "~utils/edge-snap-exit"

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
  // 指针从吸附侧直接离开窗口时的保持截止时间。
  // 多显示器或窗口未最大化时，鼠标容易短暂越出窗口边缘又返回，
  // 保持期内不触发收起，避免“弹出-收起-再弹出”闪烁
  const windowExitHoldUntilRef = useRef(0)
  // scheduleEdgePeekSync 始终调用最新的 sync，避免两个 useCallback 循环依赖
  const syncEdgePeekVisibilityRef = useRef<() => void>(() => {})

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
    () => hasOphelEdgePeekOverlay(getQueryRoots()),
    [getQueryRoots],
  )

  const scheduleEdgePeekSync = useCallback(
    (delayMs: number = 0) => {
      clearHideTimer()

      hideTimerRef.current = setTimeout(() => {
        hideTimerRef.current = null
        syncEdgePeekVisibilityRef.current()
      }, delayMs)
    },
    [clearHideTimer],
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

    if (panel.matches(":hover")) {
      setIsEdgePeeking(true)
      return
    }

    // 同侧离开窗口的保持期内推迟收起，到期后重新走完整判定
    const holdRemainingMs = windowExitHoldUntilRef.current - Date.now()
    if (holdRemainingMs > 0) {
      scheduleEdgePeekSync(holdRemainingMs)
      return
    }

    setIsEdgePeeking(false)
  }, [findUiElement, hasOpenEdgePeekOverlay, isSettingsOpenRef, scheduleEdgePeekSync])

  useEffect(() => {
    syncEdgePeekVisibilityRef.current = syncEdgePeekVisibility
  }, [syncEdgePeekVisibility])

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

  // 指针从吸附侧直接离开浏览器窗口（relatedTarget 为 null）时进入保持期。
  // 与 launcher peek 的窗口外判定保持一致，同时监听 pointerout/mouseout
  useEffect(() => {
    if (!edgeSnapState || panelMode !== "edge-snap") return

    const handleWindowExit = (event: PointerEvent | MouseEvent) => {
      if (event.relatedTarget !== null) return

      const snapSide = edgeSnapStateRef.current
      if (!snapSide || panelModeRef.current !== "edge-snap") return

      const exitSide = resolveWindowExitSide(event.clientX, window.innerWidth)
      if (exitSide !== snapSide) return

      windowExitHoldUntilRef.current = Date.now() + WINDOW_EXIT_HOLD_MS
    }

    document.addEventListener("pointerout", handleWindowExit, true)
    document.addEventListener("mouseout", handleWindowExit, true)

    return () => {
      document.removeEventListener("pointerout", handleWindowExit, true)
      document.removeEventListener("mouseout", handleWindowExit, true)
    }
  }, [edgeSnapState, panelMode])

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
