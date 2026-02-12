import { useCallback, useMemo, useRef, useState } from "react"

import type { GlobalSearchPromptPreviewState, GlobalSearchResultItem } from "./types"

interface UseGlobalSearchPreviewParams {
  settingsSearchResultsRef: React.RefObject<HTMLDivElement>
  pointerDelayMs: number
  hideDelayMs: number
}

export const useGlobalSearchPreview = ({
  settingsSearchResultsRef,
  pointerDelayMs,
  hideDelayMs,
}: UseGlobalSearchPreviewParams) => {
  const [globalSearchPromptPreview, setGlobalSearchPromptPreview] =
    useState<GlobalSearchPromptPreviewState | null>(null)
  const promptPreviewTimerRef = useRef<NodeJS.Timeout | null>(null)
  const promptPreviewHideTimerRef = useRef<NodeJS.Timeout | null>(null)
  const keyboardPreviewTargetRef = useRef<string | null>(null)

  const clearPromptPreviewTimer = useCallback(() => {
    if (promptPreviewTimerRef.current) {
      clearTimeout(promptPreviewTimerRef.current)
      promptPreviewTimerRef.current = null
    }
  }, [])

  const clearPromptPreviewHideTimer = useCallback(() => {
    if (promptPreviewHideTimerRef.current) {
      clearTimeout(promptPreviewHideTimerRef.current)
      promptPreviewHideTimerRef.current = null
    }
  }, [])

  const getGlobalSearchPromptAnchorElement = useCallback(
    (itemId: string) => {
      const container = settingsSearchResultsRef.current
      if (!container) {
        return null
      }

      const candidates = container.querySelectorAll<HTMLElement>("[data-global-search-item-id]")
      for (const candidate of candidates) {
        if (candidate.dataset.globalSearchItemId === itemId) {
          return candidate
        }
      }

      return null
    },
    [settingsSearchResultsRef],
  )

  const hideGlobalSearchPromptPreview = useCallback(() => {
    clearPromptPreviewTimer()
    clearPromptPreviewHideTimer()
    keyboardPreviewTargetRef.current = null
    setGlobalSearchPromptPreview(null)
  }, [clearPromptPreviewHideTimer, clearPromptPreviewTimer])

  const scheduleHideGlobalSearchPromptPreview = useCallback(
    (delay = hideDelayMs) => {
      clearPromptPreviewHideTimer()
      promptPreviewHideTimerRef.current = setTimeout(() => {
        hideGlobalSearchPromptPreview()
        promptPreviewHideTimerRef.current = null
      }, delay)
    },
    [clearPromptPreviewHideTimer, hideDelayMs, hideGlobalSearchPromptPreview],
  )

  const scheduleGlobalSearchPromptPreview = useCallback(
    ({
      item,
      anchorElement,
      delay,
      source,
    }: {
      item: GlobalSearchResultItem
      anchorElement: HTMLElement
      delay: number
      source: "pointer" | "keyboard"
    }) => {
      if (
        item.category !== "prompts" ||
        !item.promptId ||
        !item.promptContent ||
        !item.promptContent.trim()
      ) {
        return
      }

      clearPromptPreviewTimer()
      clearPromptPreviewHideTimer()

      if (source === "keyboard") {
        keyboardPreviewTargetRef.current = item.id
      }

      promptPreviewTimerRef.current = setTimeout(() => {
        if (source === "keyboard" && keyboardPreviewTargetRef.current !== item.id) {
          return
        }

        setGlobalSearchPromptPreview({
          itemId: item.id,
          content: item.promptContent!,
          anchorRect: anchorElement.getBoundingClientRect(),
        })

        promptPreviewTimerRef.current = null
      }, delay)
    },
    [clearPromptPreviewHideTimer, clearPromptPreviewTimer],
  )

  const scheduleGlobalSearchPointerPreview = useCallback(
    ({ item, anchorElement }: { item: GlobalSearchResultItem; anchorElement: HTMLElement }) => {
      keyboardPreviewTargetRef.current = null
      scheduleGlobalSearchPromptPreview({
        item,
        anchorElement,
        delay: pointerDelayMs,
        source: "pointer",
      })
    },
    [pointerDelayMs, scheduleGlobalSearchPromptPreview],
  )

  const refreshGlobalSearchPromptPreviewAnchorRect = useCallback(() => {
    setGlobalSearchPromptPreview((current) => {
      if (!current) {
        return current
      }

      const anchorElement = getGlobalSearchPromptAnchorElement(current.itemId)
      if (!anchorElement) {
        return null
      }

      const nextRect = anchorElement.getBoundingClientRect()
      const isSameRect =
        Math.abs(nextRect.top - current.anchorRect.top) < 0.5 &&
        Math.abs(nextRect.left - current.anchorRect.left) < 0.5 &&
        Math.abs(nextRect.right - current.anchorRect.right) < 0.5 &&
        Math.abs(nextRect.bottom - current.anchorRect.bottom) < 0.5

      if (isSameRect) {
        return current
      }

      return {
        ...current,
        anchorRect: nextRect,
      }
    })
  }, [getGlobalSearchPromptAnchorElement])

  const globalSearchPromptPreviewPosition = useMemo(() => {
    if (!globalSearchPromptPreview || typeof window === "undefined") {
      return null
    }

    const viewportPadding = 16
    const gap = 12
    const previewWidth = Math.max(280, Math.min(420, window.innerWidth - viewportPadding * 2))
    const previewEstimatedHeight = Math.max(
      220,
      Math.min(420, window.innerHeight - viewportPadding * 2),
    )

    let left = globalSearchPromptPreview.anchorRect.right + gap
    if (left + previewWidth > window.innerWidth - viewportPadding) {
      left = globalSearchPromptPreview.anchorRect.left - previewWidth - gap
    }

    left = Math.max(
      viewportPadding,
      Math.min(left, window.innerWidth - previewWidth - viewportPadding),
    )

    const top = Math.max(
      viewportPadding,
      Math.min(
        globalSearchPromptPreview.anchorRect.top,
        window.innerHeight - viewportPadding - previewEstimatedHeight,
      ),
    )

    return { top, left }
  }, [globalSearchPromptPreview])

  return {
    globalSearchPromptPreview,
    globalSearchPromptPreviewPosition,
    clearPromptPreviewTimer,
    clearPromptPreviewHideTimer,
    hideGlobalSearchPromptPreview,
    scheduleHideGlobalSearchPromptPreview,
    scheduleGlobalSearchPromptPreview,
    scheduleGlobalSearchPointerPreview,
    refreshGlobalSearchPromptPreviewAnchorRect,
  }
}
