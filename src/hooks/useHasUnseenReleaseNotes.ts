import { useEffect, useState } from "react"

import { platform } from "~platform"
import { hasCurrentReleaseNotes } from "~release-notes"
import {
  getReleaseNotesState,
  normalizeReleaseNotesState,
  RELEASE_NOTES_STATE_KEY,
} from "~release-notes/storage"
import { APP_VERSION } from "~utils/config"

/**
 * 各入口（面板 logo、设置侧栏、关于页）共享的“当前版本更新日志未读”状态。
 * 读同一份平台存储并 watch 变化，保证所有入口的红点同生同灭。
 */
export function useHasUnseenReleaseNotes(): boolean {
  const [unseen, setUnseen] = useState(false)

  useEffect(() => {
    if (!hasCurrentReleaseNotes()) return

    let cancelled = false
    const apply = (value: unknown) => {
      if (cancelled) return
      setUnseen(normalizeReleaseNotesState(value).lastSeenVersion !== APP_VERSION)
    }

    getReleaseNotesState()
      .then(apply)
      .catch((error) => {
        console.warn("[Ophel] Failed to read release notes state:", error)
      })
    const unwatch = platform.storage.watch(RELEASE_NOTES_STATE_KEY, apply)

    return () => {
      cancelled = true
      unwatch()
    }
  }, [])

  return unseen
}
