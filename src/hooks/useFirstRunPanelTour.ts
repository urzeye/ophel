import { useCallback, useEffect, useRef, useState } from "react"

import { useSettingsHydrated, useSettingsStore } from "~stores/settings-store"
import { dismissGuidance, markGuidanceShown, shouldShowGuidance } from "~utils/guidance-storage"

const TOUR_ID = "first-run-panel-tour"

/**
 * 首装面板导览触发器。
 *
 * 免责声明在本会话由「未同意」变为「同意」时挂起一次导览，待面板可见后
 * 经注册表确认（每个浏览器只展示一次）再打开；完成或跳过都会永久记录。
 * 老用户升级时 hydration 直接得到已同意，不满足 false -> true，不会触发。
 */
export function useFirstRunPanelTour(canShow: boolean) {
  const [tourVisible, setTourVisible] = useState(false)
  const pendingRef = useRef(false)
  const agreedRef = useRef<boolean | null>(null)
  const isHydrated = useSettingsHydrated()
  const hasAgreedToTerms = useSettingsStore((state) => state.settings?.hasAgreedToTerms ?? false)

  // 同意状态翻转检测 + 待展示消费放在同一个 effect：
  // ref 变化不会触发重跑，拆成两个 effect 时消费方会因依赖未变而永远挂起
  useEffect(() => {
    if (!isHydrated) return
    const prev = agreedRef.current
    agreedRef.current = hasAgreedToTerms
    if (prev === false && hasAgreedToTerms) {
      pendingRef.current = true
    }

    if (!canShow || !pendingRef.current || tourVisible) return
    pendingRef.current = false

    let cancelled = false
    void (async () => {
      try {
        if (!(await shouldShowGuidance(TOUR_ID))) return
        await markGuidanceShown(TOUR_ID)
        if (!cancelled) setTourVisible(true)
      } catch (error) {
        console.warn("[Ophel] Failed to check first-run tour state:", error)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [isHydrated, hasAgreedToTerms, canShow, tourVisible])

  const exitTour = useCallback(() => {
    dismissGuidance(TOUR_ID).catch((error) => {
      console.warn("[Ophel] Failed to persist first-run tour state:", error)
    })
    setTourVisible(false)
  }, [])

  return { tourVisible, exitTour }
}
