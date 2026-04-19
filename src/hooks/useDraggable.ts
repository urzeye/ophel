/**
 * 面板拖拽 Hook（高性能版本）
 *
 * - 通过 header 拖拽移动面板
 * - 拖拽结束时检测边缘吸附
 * - 窗口 resize 时边界检测
 *
 * ⭐ 性能优化：
 * - 使用 useRef 存储位置，避免频繁触发 React 渲染
 * - 在 mousemove 中直接操作 DOM，绕过 React 更新周期
 */

import { useCallback, useEffect, useRef } from "react"

interface UseDraggableOptions {
  edgeSnapHide?: boolean
  edgeSnapState?: "left" | "right" | null // 当前吸附状态
  snapThreshold?: number // 吸附触发距离，默认 30
  onEdgeSnap?: (side: "left" | "right") => void
  onUnsnap?: () => void
}

export function useDraggable(options: UseDraggableOptions = {}) {
  const { edgeSnapHide = false, edgeSnapState, snapThreshold = 30, onEdgeSnap, onUnsnap } = options

  const panelRef = useRef<HTMLDivElement>(null)
  const headerRef = useRef<HTMLDivElement>(null)

  // 使用 Ref 存储实时状态，避免触发 React 渲染
  const isDraggingRef = useRef(false)
  const hasMovedRef = useRef(false)
  const offsetRef = useRef({ x: 0, y: 0 })

  // 延迟取消吸附：记录 mousedown 时的吸附状态，仅在实际拖拽移动时才执行取消
  // 这样单击/双击（如双击标题切换隐私模式）不会导致面板脱离吸附
  const pendingUnsnapRef = useRef<"left" | "right" | null>(null)
  // 动画 RAF ID，用于组件卸载时取消
  const animationRafRef = useRef<number | null>(null)

  // 开始拖拽
  const handleMouseDown = useCallback(
    (e: MouseEvent) => {
      // 排除控制按钮区域
      if ((e.target as Element).closest(".gh-panel-controls")) return

      const panel = panelRef.current
      if (!panel) return

      e.preventDefault() // 阻止文本选中

      // 记录当前吸附状态，延迟到实际移动时才取消吸附
      pendingUnsnapRef.current = edgeSnapState || null

      // 读取面板当前的实际位置
      const rect = panel.getBoundingClientRect()

      // 计算鼠标相对于面板左上角的偏移
      offsetRef.current = {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
      }

      hasMovedRef.current = false
      isDraggingRef.current = true

      // 拖动时禁止全局文本选中
      document.body.style.userSelect = "none"
    },
    [edgeSnapState],
  )

  // 拖拽移动 - 直接操作 DOM，不触发 React 渲染
  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      if (!isDraggingRef.current) return

      const panel = panelRef.current
      if (!panel) return

      e.preventDefault()

      // 首次移动时：执行延迟的取消吸附 + 切换 CSS 定位模式
      if (!hasMovedRef.current) {
        hasMovedRef.current = true

        // 执行延迟的取消吸附
        if (pendingUnsnapRef.current) {
          onUnsnap?.()
          pendingUnsnapRef.current = null
        }

        // 同步移除吸附 class，避免其 !important 定位在 React 重渲染前覆盖拖拽位置
        panel.classList.remove("edge-snapped-left", "edge-snapped-right")

        // 切换 CSS 定位从 right+transform 为 left+top，避免后续拖拽跳动
        panel.style.right = "auto"
        panel.style.transform = "none"

        // 添加 dragging 类，通过 CSS !important 确保拖拽时定位不会被 React 重渲染覆盖
        panel.classList.add("dragging")
      }

      // 核心优化：直接操作 DOM 样式，绕过 React 更新
      panel.style.left = e.clientX - offsetRef.current.x + "px"
      panel.style.top = e.clientY - offsetRef.current.y + "px"
    },
    [onUnsnap],
  )

  // 动画过渡函数
  const animateToPosition = useCallback(
    (targetLeft: number, targetTop: number, duration = 300, onComplete?: () => void) => {
      const panel = panelRef.current
      if (!panel) return

      // 取消正在进行的动画
      if (animationRafRef.current !== null) {
        cancelAnimationFrame(animationRafRef.current)
        animationRafRef.current = null
      }

      // 读取当前数值或实时位置
      const startLeft = parseFloat(panel.style.left) || panel.getBoundingClientRect().left
      const startTop = parseFloat(panel.style.top) || panel.getBoundingClientRect().top
      const startTime = performance.now()

      const animate = (currentTime: number) => {
        const elapsed = currentTime - startTime
        let progress = Math.min(elapsed / duration, 1)

        // ease-out-cubic
        progress = 1 - Math.pow(1 - progress, 3)

        const currentLeft = startLeft + (targetLeft - startLeft) * progress
        const currentTop = startTop + (targetTop - startTop) * progress

        panel.style.left = `${currentLeft}px`
        panel.style.top = `${currentTop}px`

        if (progress < 1) {
          animationRafRef.current = requestAnimationFrame(animate)
        } else {
          animationRafRef.current = null
          onComplete?.()
        }
      }

      animationRafRef.current = requestAnimationFrame(animate)
    },
    [],
  )

  // 结束拖拽
  const handleMouseUp = useCallback(() => {
    if (!isDraggingRef.current) return

    const panel = panelRef.current
    const hasMoved = hasMovedRef.current

    isDraggingRef.current = false
    pendingUnsnapRef.current = null

    // 恢复文本选中
    document.body.style.userSelect = ""

    // 移除 dragging 类（但保持 left/top 样式，面板会停留在当前位置）
    panel?.classList.remove("dragging")

    // 边缘吸附检测
    if (edgeSnapHide && hasMoved && panel) {
      const rect = panel.getBoundingClientRect()
      const vw = window.innerWidth
      const pw = rect.width
      const pTop = rect.top

      if (rect.left < snapThreshold) {
        animateToPosition(12 - pw, pTop, 250, () => {
          onEdgeSnap?.("left")
        })
      } else if (vw - rect.right < snapThreshold) {
        animateToPosition(vw - 12, pTop, 250, () => {
          onEdgeSnap?.("right")
        })
      }
    }
  }, [edgeSnapHide, onEdgeSnap, snapThreshold, animateToPosition])

  // 边界检测：确保面板在视口内可见
  const clampToViewport = useCallback(() => {
    const panel = panelRef.current
    if (!panel) return

    // 跳过条件：处于吸附状态
    if (edgeSnapState) return

    const rect = panel.getBoundingClientRect()
    const vw = window.innerWidth
    const vh = window.innerHeight
    const margin = 10

    let newLeft = rect.left
    let newTop = rect.top

    // 超出边界检测
    if (rect.right > vw) newLeft = vw - rect.width - margin
    if (rect.bottom > vh) newTop = vh - rect.height - margin
    if (rect.left < 0) newLeft = margin
    if (rect.top < 0) newTop = margin

    if (newLeft !== rect.left || newTop !== rect.top) {
      panel.style.left = newLeft + "px"
      panel.style.top = newTop + "px"
      panel.style.right = "auto"
      panel.style.transform = "none"
    }
  }, [edgeSnapState])

  // 绑定事件
  useEffect(() => {
    const header = headerRef.current
    if (!header) return

    header.addEventListener("mousedown", handleMouseDown)
    document.addEventListener("mousemove", handleMouseMove)
    document.addEventListener("mouseup", handleMouseUp)
    window.addEventListener("resize", clampToViewport)

    return () => {
      header.removeEventListener("mousedown", handleMouseDown)
      document.removeEventListener("mousemove", handleMouseMove)
      document.removeEventListener("mouseup", handleMouseUp)
      window.removeEventListener("resize", clampToViewport)
      if (animationRafRef.current !== null) {
        cancelAnimationFrame(animationRafRef.current)
        animationRafRef.current = null
      }
    }
  }, [handleMouseDown, handleMouseMove, handleMouseUp, clampToViewport])

  return {
    panelRef,
    headerRef,
  }
}
