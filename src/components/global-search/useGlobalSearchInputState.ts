import { useCallback, useEffect, useRef, useState } from "react"

import { GLOBAL_SEARCH_INPUT_DEBOUNCE_MS } from "./constants"

export const useGlobalSearchInputState = () => {
  const [settingsSearchInputValue, setSettingsSearchInputValue] = useState("")
  const [settingsSearchQuery, setSettingsSearchQuery] = useState("")
  const searchInputDebounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const clearSettingsSearchInputDebounceTimer = useCallback(() => {
    if (!searchInputDebounceTimerRef.current) {
      return
    }

    clearTimeout(searchInputDebounceTimerRef.current)
    searchInputDebounceTimerRef.current = null
  }, [])

  const syncSettingsSearchInputAndQuery = useCallback(
    (nextValue: string) => {
      clearSettingsSearchInputDebounceTimer()
      setSettingsSearchInputValue(nextValue)
      setSettingsSearchQuery(nextValue)
    },
    [clearSettingsSearchInputDebounceTimer],
  )

  const commitSettingsSearchInputValue = useCallback(
    (nextValue: string) => {
      setSettingsSearchInputValue(nextValue)
      clearSettingsSearchInputDebounceTimer()

      searchInputDebounceTimerRef.current = setTimeout(() => {
        setSettingsSearchQuery(nextValue)
        searchInputDebounceTimerRef.current = null
      }, GLOBAL_SEARCH_INPUT_DEBOUNCE_MS)
    },
    [clearSettingsSearchInputDebounceTimer],
  )

  useEffect(
    () => () => {
      clearSettingsSearchInputDebounceTimer()
    },
    [clearSettingsSearchInputDebounceTimer],
  )

  return {
    settingsSearchInputValue,
    setSettingsSearchInputValue,
    settingsSearchQuery,
    setSettingsSearchQuery,
    clearSettingsSearchInputDebounceTimer,
    syncSettingsSearchInputAndQuery,
    commitSettingsSearchInputValue,
  }
}
