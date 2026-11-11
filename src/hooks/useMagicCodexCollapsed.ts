import { useEffect, useState } from "react"

import { platform } from "~platform"

export const MAGIC_CODEX_COLLAPSED_KEY = "ophel:magicCodexCollapsed"

const persistCollapsed = (collapsed: boolean): void => {
  platform.storage.set(MAGIC_CODEX_COLLAPSED_KEY, collapsed).catch((error) => {
    console.warn("[Ophel] Failed to persist magic codex collapsed state:", error)
  })
}

/**
 * MagicCodex 技巧面板的折叠状态：走平台统一存储（扩展 chrome.storage / 油猴 GM），
 * 所有站点共享同一份状态，而不是写宿主站点的 localStorage。
 */
export function useMagicCodexCollapsed(): [boolean, (next: boolean) => void] {
  const [collapsed, setCollapsed] = useState(false)

  useEffect(() => {
    let cancelled = false
    const apply = (value: unknown) => {
      if (cancelled) return
      setCollapsed(value === true)
    }

    platform.storage
      .get<boolean>(MAGIC_CODEX_COLLAPSED_KEY)
      .then(apply)
      .catch((error) => {
        console.warn("[Ophel] Failed to read magic codex collapsed state:", error)
      })
    const unwatch = platform.storage.watch(MAGIC_CODEX_COLLAPSED_KEY, apply)

    return () => {
      cancelled = true
      unwatch()
    }
  }, [])

  const update = (next: boolean) => {
    setCollapsed(next)
    persistCollapsed(next)
  }

  return [collapsed, update]
}
