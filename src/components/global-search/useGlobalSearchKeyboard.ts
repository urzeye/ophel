import { useCallback, useEffect } from "react"

import type {
  GlobalSearchCategoryId,
  GlobalSearchResultItem,
  GlobalSearchSyntaxSuggestionItem,
} from "./types"

interface UseGlobalSearchKeyboardParams {
  isGlobalSettingsSearchOpen: boolean
  showGlobalSearchSyntaxHelp: boolean
  setShowGlobalSearchSyntaxHelp: (nextValue: boolean) => void
  activeGlobalSearchCategory: GlobalSearchCategoryId
  categoryIds: GlobalSearchCategoryId[]
  setActiveGlobalSearchCategory: (categoryId: GlobalSearchCategoryId) => void
  settingsSearchActiveIndex: number
  setSettingsSearchActiveIndex: React.Dispatch<React.SetStateAction<number>>
  settingsSearchNavigationMode: "keyboard" | "pointer"
  setSettingsSearchNavigationMode: React.Dispatch<React.SetStateAction<"keyboard" | "pointer">>
  setSettingsSearchHoverLocked: React.Dispatch<React.SetStateAction<boolean>>
  shouldShowGlobalSearchSyntaxSuggestions: boolean
  globalSearchSyntaxSuggestions: GlobalSearchSyntaxSuggestionItem[]
  activeSearchSyntaxSuggestionIndex: number
  setActiveSearchSyntaxSuggestionIndex: React.Dispatch<React.SetStateAction<number>>
  applyGlobalSearchSyntaxSuggestion: (suggestion: GlobalSearchSyntaxSuggestionItem) => void
  visibleGlobalSearchResults: GlobalSearchResultItem[]
  navigateToSearchResult: (item: GlobalSearchResultItem) => void
  closeGlobalSettingsSearch: (options?: {
    restoreFocus?: boolean
    reopenSettings?: boolean
  }) => void
  getShouldReturnToSettingsOnEscape: () => boolean
  settingsSearchResultsRef: React.RefObject<HTMLDivElement>
  keyboardSafeTop: number
  keyboardSafeBottom: number
}

export const useGlobalSearchKeyboard = ({
  isGlobalSettingsSearchOpen,
  showGlobalSearchSyntaxHelp,
  setShowGlobalSearchSyntaxHelp,
  activeGlobalSearchCategory,
  categoryIds,
  setActiveGlobalSearchCategory,
  settingsSearchActiveIndex,
  setSettingsSearchActiveIndex,
  settingsSearchNavigationMode,
  setSettingsSearchNavigationMode,
  setSettingsSearchHoverLocked,
  shouldShowGlobalSearchSyntaxSuggestions,
  globalSearchSyntaxSuggestions,
  activeSearchSyntaxSuggestionIndex,
  setActiveSearchSyntaxSuggestionIndex,
  applyGlobalSearchSyntaxSuggestion,
  visibleGlobalSearchResults,
  navigateToSearchResult,
  closeGlobalSettingsSearch,
  getShouldReturnToSettingsOnEscape,
  settingsSearchResultsRef,
  keyboardSafeTop,
  keyboardSafeBottom,
}: UseGlobalSearchKeyboardParams) => {
  useEffect(() => {
    if (!isGlobalSettingsSearchOpen) {
      return
    }

    const handleSearchNavigation = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault()
        event.stopPropagation()

        if (showGlobalSearchSyntaxHelp) {
          setShowGlobalSearchSyntaxHelp(false)
          return
        }

        const shouldReturnToSettings = getShouldReturnToSettingsOnEscape()
        closeGlobalSettingsSearch({
          restoreFocus: !shouldReturnToSettings,
          reopenSettings: shouldReturnToSettings,
        })
        return
      }

      if (event.key === "Tab") {
        event.preventDefault()
        event.stopPropagation()

        const currentIndex = categoryIds.findIndex(
          (categoryId) => categoryId === activeGlobalSearchCategory,
        )

        if (currentIndex < 0) {
          setActiveGlobalSearchCategory("all")
          setSettingsSearchActiveIndex(0)
          setSettingsSearchHoverLocked(false)
          setSettingsSearchNavigationMode("keyboard")
          return
        }

        const categoriesLength = categoryIds.length
        const nextIndex = event.shiftKey
          ? (currentIndex - 1 + categoriesLength) % categoriesLength
          : (currentIndex + 1) % categoriesLength

        setActiveGlobalSearchCategory(categoryIds[nextIndex])
        setSettingsSearchActiveIndex(0)
        setSettingsSearchHoverLocked(false)
        setSettingsSearchNavigationMode("keyboard")
        return
      }

      if (shouldShowGlobalSearchSyntaxSuggestions) {
        if (event.key === "ArrowDown") {
          event.preventDefault()
          event.stopPropagation()
          setActiveSearchSyntaxSuggestionIndex((previousIndex) => {
            if (globalSearchSyntaxSuggestions.length === 0) {
              return -1
            }

            const nextIndex = previousIndex + 1
            if (nextIndex >= globalSearchSyntaxSuggestions.length) {
              return 0
            }
            return nextIndex
          })
          return
        }

        if (event.key === "ArrowUp") {
          event.preventDefault()
          event.stopPropagation()
          setActiveSearchSyntaxSuggestionIndex((previousIndex) => {
            if (globalSearchSyntaxSuggestions.length === 0) {
              return -1
            }

            const nextIndex = previousIndex - 1
            if (nextIndex < 0) {
              return globalSearchSyntaxSuggestions.length - 1
            }
            return nextIndex
          })
          return
        }

        if (event.key === "Enter" && activeSearchSyntaxSuggestionIndex >= 0) {
          const selectedSuggestion =
            globalSearchSyntaxSuggestions[activeSearchSyntaxSuggestionIndex]
          if (!selectedSuggestion) {
            return
          }

          event.preventDefault()
          event.stopPropagation()
          applyGlobalSearchSyntaxSuggestion(selectedSuggestion)
          return
        }
      }

      if (event.key === "ArrowDown") {
        event.preventDefault()
        event.stopPropagation()
        setSettingsSearchHoverLocked(true)
        setSettingsSearchNavigationMode("keyboard")
        setSettingsSearchActiveIndex((prev) => {
          if (visibleGlobalSearchResults.length === 0) return 0
          return (prev + 1) % visibleGlobalSearchResults.length
        })
        return
      }

      if (event.key === "ArrowUp") {
        event.preventDefault()
        event.stopPropagation()
        setSettingsSearchHoverLocked(true)
        setSettingsSearchNavigationMode("keyboard")
        setSettingsSearchActiveIndex((prev) => {
          if (visibleGlobalSearchResults.length === 0) return 0
          return (prev - 1 + visibleGlobalSearchResults.length) % visibleGlobalSearchResults.length
        })
        return
      }

      if (event.key === "Enter") {
        if (visibleGlobalSearchResults.length === 0) return

        const selected =
          visibleGlobalSearchResults[settingsSearchActiveIndex] || visibleGlobalSearchResults[0]
        if (!selected) return

        if (!visibleGlobalSearchResults[settingsSearchActiveIndex]) {
          setSettingsSearchActiveIndex(0)
        }

        event.preventDefault()
        event.stopPropagation()
        navigateToSearchResult(selected)
      }
    }

    window.addEventListener("keydown", handleSearchNavigation, true)
    return () => {
      window.removeEventListener("keydown", handleSearchNavigation, true)
    }
  }, [
    activeGlobalSearchCategory,
    activeSearchSyntaxSuggestionIndex,
    applyGlobalSearchSyntaxSuggestion,
    categoryIds,
    closeGlobalSettingsSearch,
    globalSearchSyntaxSuggestions,
    isGlobalSettingsSearchOpen,
    navigateToSearchResult,
    setActiveGlobalSearchCategory,
    setActiveSearchSyntaxSuggestionIndex,
    setSettingsSearchActiveIndex,
    setSettingsSearchHoverLocked,
    setSettingsSearchNavigationMode,
    setShowGlobalSearchSyntaxHelp,
    settingsSearchActiveIndex,
    getShouldReturnToSettingsOnEscape,
    shouldShowGlobalSearchSyntaxSuggestions,
    showGlobalSearchSyntaxHelp,
    visibleGlobalSearchResults,
  ])

  useEffect(() => {
    if (visibleGlobalSearchResults.length === 0) {
      if (settingsSearchActiveIndex !== 0) {
        setSettingsSearchActiveIndex(0)
      }
      return
    }

    if (settingsSearchActiveIndex >= visibleGlobalSearchResults.length) {
      setSettingsSearchActiveIndex(0)
    }
  }, [settingsSearchActiveIndex, setSettingsSearchActiveIndex, visibleGlobalSearchResults.length])

  useEffect(() => {
    if (!shouldShowGlobalSearchSyntaxSuggestions) {
      if (activeSearchSyntaxSuggestionIndex !== -1) {
        setActiveSearchSyntaxSuggestionIndex(-1)
      }
      return
    }

    if (activeSearchSyntaxSuggestionIndex >= globalSearchSyntaxSuggestions.length) {
      setActiveSearchSyntaxSuggestionIndex(globalSearchSyntaxSuggestions.length - 1)
    }
  }, [
    activeSearchSyntaxSuggestionIndex,
    globalSearchSyntaxSuggestions.length,
    setActiveSearchSyntaxSuggestionIndex,
    shouldShowGlobalSearchSyntaxSuggestions,
  ])

  const ensureGlobalSearchItemVisible = useCallback(
    (container: HTMLDivElement, activeItem: HTMLElement) => {
      const containerRect = container.getBoundingClientRect()
      const activeRect = activeItem.getBoundingClientRect()
      const safeTopBoundary = containerRect.top + keyboardSafeTop
      const safeBottomBoundary = containerRect.bottom - keyboardSafeBottom

      if (activeRect.top < safeTopBoundary) {
        const delta = activeRect.top - safeTopBoundary
        container.scrollTop = Math.max(0, container.scrollTop + delta)
        return
      }

      if (activeRect.bottom > safeBottomBoundary) {
        const delta = activeRect.bottom - safeBottomBoundary
        const maxScrollTop = Math.max(0, container.scrollHeight - container.clientHeight)
        container.scrollTop = Math.min(maxScrollTop, container.scrollTop + delta)
      }
    },
    [keyboardSafeBottom, keyboardSafeTop],
  )

  useEffect(() => {
    if (!isGlobalSettingsSearchOpen) {
      return
    }

    if (settingsSearchNavigationMode !== "keyboard") {
      return
    }

    const container = settingsSearchResultsRef.current
    if (!container) {
      return
    }

    const activeItem = container.querySelector<HTMLElement>(
      `[data-global-search-index=\"${settingsSearchActiveIndex}\"]`,
    )
    if (!activeItem) {
      return
    }

    ensureGlobalSearchItemVisible(container, activeItem)
  }, [
    ensureGlobalSearchItemVisible,
    isGlobalSettingsSearchOpen,
    settingsSearchActiveIndex,
    settingsSearchNavigationMode,
    settingsSearchResultsRef,
    visibleGlobalSearchResults,
  ])
}
