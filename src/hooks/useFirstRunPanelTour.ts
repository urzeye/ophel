import { useCallback, useEffect, useRef, useState } from "react"

import { dismissGuidance, markGuidanceShown, shouldShowGuidance } from "~utils/guidance-storage"

const TOUR_ID = "first-run-panel-tour"

/**
 * 首装面板导览触发器。
 *
 * 只响应当前页面的协议确认回调，跨标签页设置同步和老用户升级均不触发。
 * 注册表允许展示时主动展开面板，卡片实际可见后才记录展示；完成或跳过永久停用。
 */
export function useFirstRunPanelTour(canShow: boolean, preparePanel: () => void) {
  const [phase, setPhase] = useState<"idle" | "pending" | "shown">("idle")
  const mountedRef = useRef(false)
  const checkingRef = useRef(false)
  const shownWriteRef = useRef<Promise<unknown> | null>(null)

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  const requestTour = useCallback(() => {
    if (checkingRef.current || shownWriteRef.current) return
    checkingRef.current = true

    void (async () => {
      try {
        if (!(await shouldShowGuidance(TOUR_ID))) return
        if (!mountedRef.current) return
        preparePanel()
        setPhase("pending")
      } catch (error) {
        console.warn("[Ophel] Failed to check first-run tour state:", error)
      } finally {
        checkingRef.current = false
      }
    })()
  }, [preparePanel])

  const markTourShown = useCallback(() => {
    if (shownWriteRef.current) return
    setPhase("shown")
    shownWriteRef.current = markGuidanceShown(TOUR_ID).catch((error) => {
      console.warn("[Ophel] Failed to record first-run tour display:", error)
    })
  }, [])

  const exitTour = useCallback(() => {
    setPhase("idle")
    // 展示计数和关闭标记串行写同一个键，避免快速跳过时互相覆盖。
    void (shownWriteRef.current ?? Promise.resolve())
      .then(() => dismissGuidance(TOUR_ID))
      .catch((error) => {
        console.warn("[Ophel] Failed to persist first-run tour state:", error)
      })
  }, [])

  useEffect(() => {
    if (phase === "shown" && !canShow) exitTour()
  }, [canShow, exitTour, phase])

  return { tourVisible: canShow && phase !== "idle", requestTour, markTourShown, exitTour }
}
