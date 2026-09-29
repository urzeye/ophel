import { useEffect, useState } from "react"

import { platform } from "~platform"

export const EXPORT_DISCOVERED_KEY = "ophel:exportDiscovered"

export const getExportDiscovered = async (): Promise<boolean> => {
  const value = await platform.storage.get<boolean>(EXPORT_DISCOVERED_KEY)
  return value === true
}

export const markExportDiscovered = async (): Promise<void> => {
  await platform.storage.set(EXPORT_DISCOVERED_KEY, true)
}

/** 静默标记：持久化失败仅告警，不阻断导出主流程 */
export const markExportDiscoveredQuiet = (): void => {
  markExportDiscovered().catch((error) => {
    console.warn("[Ophel] Failed to persist export discovery state:", error)
  })
}

/**
 * 导出按钮引导状态：大纲工具栏导出按钮的流光提示只在用户从未点击过该按钮时展示，
 * 首次点击后永久停用，避免常驻动效干扰。其他导出入口（对话页、快捷键等）不影响此状态。
 */
export function useExportDiscovered(): boolean {
  // 默认视为已发现（无流光），确认未发现后再开启，避免老用户每次挂载都闪一下
  const [discovered, setDiscovered] = useState(true)

  useEffect(() => {
    let cancelled = false
    const apply = (value: unknown) => {
      if (cancelled) return
      setDiscovered(value === true)
    }

    getExportDiscovered()
      .then(apply)
      .catch((error) => {
        console.warn("[Ophel] Failed to read export discovery state:", error)
      })
    const unwatch = platform.storage.watch(EXPORT_DISCOVERED_KEY, apply)

    return () => {
      cancelled = true
      unwatch()
    }
  }, [])

  return discovered
}
