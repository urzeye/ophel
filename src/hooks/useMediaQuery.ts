import { useCallback, useMemo, useSyncExternalStore } from "react"

/**
 * 订阅媒体查询结果。输入方式和视口宽度会在运行中变化（平板接上鼠标、旋转屏幕、
 * 调整窗口），结果随之实时更新。MediaQueryList 按查询缓存，渲染时不重复创建。
 */
export function useMediaQuery(query: string): boolean {
  const mediaQueryList = useMemo(
    () => (typeof window !== "undefined" && window.matchMedia ? window.matchMedia(query) : null),
    [query],
  )

  const subscribe = useCallback(
    (onChange: () => void) => {
      if (!mediaQueryList) return () => {}
      mediaQueryList.addEventListener("change", onChange)
      return () => mediaQueryList.removeEventListener("change", onChange)
    },
    [mediaQueryList],
  )

  const getSnapshot = useCallback(() => mediaQueryList?.matches ?? false, [mediaQueryList])

  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}
