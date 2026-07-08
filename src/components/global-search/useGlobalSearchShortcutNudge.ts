import { useCallback, useEffect, useRef, useState } from "react"

import {
  GLOBAL_SEARCH_SHORTCUT_NUDGE_AUTO_DISMISS_SHORTCUT_COUNT,
  GLOBAL_SEARCH_SHORTCUT_NUDGE_AUTO_HIDE_MS,
  GLOBAL_SEARCH_SHORTCUT_NUDGE_MAX_SHOWS,
  GLOBAL_SEARCH_SHORTCUT_NUDGE_MIN_INTERVAL,
  GLOBAL_SEARCH_SHORTCUT_NUDGE_STORAGE_KEY,
} from "./constants"

interface GlobalSearchShortcutNudgeState {
  shownCount: number
  lastShownAt: number
  dismissed: boolean
  shortcutUsedCount: number
}

const getDefaultGlobalSearchShortcutNudgeState = (): GlobalSearchShortcutNudgeState => ({
  shownCount: 0,
  lastShownAt: 0,
  dismissed: false,
  shortcutUsedCount: 0,
})

export const useGlobalSearchShortcutNudge = (globalSearchShortcutNudgeText: string) => {
  const [showGlobalSearchShortcutNudge, setShowGlobalSearchShortcutNudge] = useState(false)
  const [globalSearchShortcutNudgeMessage, setGlobalSearchShortcutNudgeMessage] = useState("")
  const globalSearchNudgeHideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const getGlobalSearchShortcutNudgeState = useCallback((): GlobalSearchShortcutNudgeState => {
    if (typeof window === "undefined") {
      return getDefaultGlobalSearchShortcutNudgeState()
    }

    try {
      const rawValue = window.localStorage.getItem(GLOBAL_SEARCH_SHORTCUT_NUDGE_STORAGE_KEY)
      if (!rawValue) {
        return getDefaultGlobalSearchShortcutNudgeState()
      }

      const parsedValue = JSON.parse(rawValue) as Partial<GlobalSearchShortcutNudgeState>

      return {
        shownCount: Number.isFinite(parsedValue.shownCount)
          ? Math.max(0, Number(parsedValue.shownCount))
          : 0,
        lastShownAt: Number.isFinite(parsedValue.lastShownAt)
          ? Math.max(0, Number(parsedValue.lastShownAt))
          : 0,
        dismissed: Boolean(parsedValue.dismissed),
        shortcutUsedCount: Number.isFinite(parsedValue.shortcutUsedCount)
          ? Math.max(0, Number(parsedValue.shortcutUsedCount))
          : 0,
      }
    } catch {
      return getDefaultGlobalSearchShortcutNudgeState()
    }
  }, [])

  const saveGlobalSearchShortcutNudgeState = useCallback(
    (nextState: GlobalSearchShortcutNudgeState) => {
      if (typeof window === "undefined") {
        return
      }

      try {
        window.localStorage.setItem(
          GLOBAL_SEARCH_SHORTCUT_NUDGE_STORAGE_KEY,
          JSON.stringify(nextState),
        )
      } catch {
        // ignore storage errors
      }
    },
    [],
  )

  const clearGlobalSearchNudgeHideTimer = useCallback(() => {
    if (globalSearchNudgeHideTimerRef.current) {
      clearTimeout(globalSearchNudgeHideTimerRef.current)
      globalSearchNudgeHideTimerRef.current = null
    }
  }, [])

  const hideGlobalSearchShortcutNudge = useCallback(() => {
    clearGlobalSearchNudgeHideTimer()
    setShowGlobalSearchShortcutNudge(false)
    setGlobalSearchShortcutNudgeMessage("")
  }, [clearGlobalSearchNudgeHideTimer])

  const dismissGlobalSearchShortcutNudgeForever = useCallback(() => {
    const currentState = getGlobalSearchShortcutNudgeState()
    saveGlobalSearchShortcutNudgeState({
      ...currentState,
      dismissed: true,
    })
    hideGlobalSearchShortcutNudge()
  }, [
    getGlobalSearchShortcutNudgeState,
    hideGlobalSearchShortcutNudge,
    saveGlobalSearchShortcutNudgeState,
  ])

  const markGlobalSearchShortcutUsed = useCallback(() => {
    const currentState = getGlobalSearchShortcutNudgeState()
    const nextShortcutUsedCount = currentState.shortcutUsedCount + 1

    saveGlobalSearchShortcutNudgeState({
      ...currentState,
      shortcutUsedCount: nextShortcutUsedCount,
      dismissed:
        currentState.dismissed ||
        nextShortcutUsedCount >= GLOBAL_SEARCH_SHORTCUT_NUDGE_AUTO_DISMISS_SHORTCUT_COUNT,
    })

    hideGlobalSearchShortcutNudge()
  }, [
    getGlobalSearchShortcutNudgeState,
    hideGlobalSearchShortcutNudge,
    saveGlobalSearchShortcutNudgeState,
  ])

  const tryShowGlobalSearchShortcutNudge = useCallback(() => {
    if (!globalSearchShortcutNudgeText) {
      return
    }

    const currentState = getGlobalSearchShortcutNudgeState()
    if (currentState.dismissed) {
      return
    }

    if (
      currentState.shortcutUsedCount >= GLOBAL_SEARCH_SHORTCUT_NUDGE_AUTO_DISMISS_SHORTCUT_COUNT
    ) {
      saveGlobalSearchShortcutNudgeState({
        ...currentState,
        dismissed: true,
      })
      return
    }

    if (currentState.shownCount >= GLOBAL_SEARCH_SHORTCUT_NUDGE_MAX_SHOWS) {
      return
    }

    const now = Date.now()
    if (
      currentState.lastShownAt > 0 &&
      now - currentState.lastShownAt < GLOBAL_SEARCH_SHORTCUT_NUDGE_MIN_INTERVAL
    ) {
      return
    }

    saveGlobalSearchShortcutNudgeState({
      ...currentState,
      shownCount: currentState.shownCount + 1,
      lastShownAt: now,
    })

    setGlobalSearchShortcutNudgeMessage(globalSearchShortcutNudgeText)
    setShowGlobalSearchShortcutNudge(true)
    clearGlobalSearchNudgeHideTimer()
    globalSearchNudgeHideTimerRef.current = setTimeout(() => {
      setShowGlobalSearchShortcutNudge(false)
      setGlobalSearchShortcutNudgeMessage("")
      globalSearchNudgeHideTimerRef.current = null
    }, GLOBAL_SEARCH_SHORTCUT_NUDGE_AUTO_HIDE_MS)
  }, [
    clearGlobalSearchNudgeHideTimer,
    getGlobalSearchShortcutNudgeState,
    globalSearchShortcutNudgeText,
    saveGlobalSearchShortcutNudgeState,
  ])

  useEffect(() => {
    return () => {
      clearGlobalSearchNudgeHideTimer()
    }
  }, [clearGlobalSearchNudgeHideTimer])

  return {
    showGlobalSearchShortcutNudge,
    globalSearchShortcutNudgeMessage,
    hideGlobalSearchShortcutNudge,
    dismissGlobalSearchShortcutNudgeForever,
    markGlobalSearchShortcutUsed,
    tryShowGlobalSearchShortcutNudge,
  }
}
