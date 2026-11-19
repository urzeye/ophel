import { useCallback, useEffect, useRef, useState } from "react"

import {
  dismissGuidance,
  markGuidanceAction,
  markGuidanceShown,
  shouldShowGuidance,
} from "~utils/guidance-storage"

import { GLOBAL_SEARCH_SHORTCUT_NUDGE_AUTO_HIDE_MS } from "./constants"

const NUDGE_ID = "global-search-shortcut-nudge"

const warnNudgePersistFailure = (error: unknown) => {
  console.warn("[Ophel] Failed to persist global search shortcut nudge state:", error)
}

export const useGlobalSearchShortcutNudge = (globalSearchShortcutNudgeText: string) => {
  const [showGlobalSearchShortcutNudge, setShowGlobalSearchShortcutNudge] = useState(false)
  const [globalSearchShortcutNudgeMessage, setGlobalSearchShortcutNudgeMessage] = useState("")
  const globalSearchNudgeHideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

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
    dismissGuidance(NUDGE_ID).catch(warnNudgePersistFailure)
    hideGlobalSearchShortcutNudge()
  }, [hideGlobalSearchShortcutNudge])

  const markGlobalSearchShortcutUsed = useCallback(() => {
    markGuidanceAction(NUDGE_ID).catch(warnNudgePersistFailure)
    hideGlobalSearchShortcutNudge()
  }, [hideGlobalSearchShortcutNudge])

  const tryShowGlobalSearchShortcutNudge = useCallback(() => {
    if (!globalSearchShortcutNudgeText) {
      return
    }

    void (async () => {
      let shouldShow = false
      try {
        shouldShow = await shouldShowGuidance(NUDGE_ID)
        if (shouldShow) {
          await markGuidanceShown(NUDGE_ID)
        }
      } catch (error) {
        warnNudgePersistFailure(error)
        return
      }
      if (!shouldShow) {
        return
      }

      setGlobalSearchShortcutNudgeMessage(globalSearchShortcutNudgeText)
      setShowGlobalSearchShortcutNudge(true)
      clearGlobalSearchNudgeHideTimer()
      globalSearchNudgeHideTimerRef.current = setTimeout(() => {
        setShowGlobalSearchShortcutNudge(false)
        setGlobalSearchShortcutNudgeMessage("")
        globalSearchNudgeHideTimerRef.current = null
      }, GLOBAL_SEARCH_SHORTCUT_NUDGE_AUTO_HIDE_MS)
    })()
  }, [clearGlobalSearchNudgeHideTimer, globalSearchShortcutNudgeText])

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
