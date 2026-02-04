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

  // 开始拖拽
  const handleMouseDown = useCallback(
    (e: MouseEvent) => {
      // 排除控制按钮区域
      if ((e.target as Element).closest(".gh-panel-controls")) return

      const panel = panelRef.current
      if (!panel) return

      e.preventDefault() // 阻止文本选中

      // 如果当前处于吸附状态，先取消吸附
      if (edgeSnapState) {
        onUnsnap?.()
      }

      // 读取面板当前的实际位置
      const rect = panel.getBoundingClientRect()

      // 计算鼠标相对于面板左上角的偏移
      offsetRef.current = {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
      }

      // 首次拖拽时，将 CSS 定位从 right+transform 切换为 left+top
      // 这样后续拖拽就不会有跳动问题
      panel.style.left = rect.left + "px"
      panel.style.top = rect.top + "px"
      panel.style.right = "auto" // 清除 right 定位
      panel.style.transform = "none" // 清除 translateY(-50%)

      hasMovedRef.current = false
      isDraggingRef.current = true

      // 添加 dragging 类，通过 CSS !important 确保拖拽时 left/top 定位不会被 React 重渲染覆盖
      panel.classList.add("dragging")

      // 拖动时禁止全局文本选中
      document.body.style.userSelect = "none"
    },
    [edgeSnapState, onUnsnap],
  )

  // 拖拽移动 - 直接操作 DOM，不触发 React 渲染
  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!isDraggingRef.current) return

    const panel = panelRef.current
    if (!panel) return

    e.preventDefault()
    hasMovedRef.current = true

    // 核心优化：直接操作 DOM 样式，绕过 React 更新
    panel.style.left = e.clientX - offsetRef.current.x + "px"
    panel.style.top = e.clientY - offsetRef.current.y + "px"
  }, [])

  // 结束拖拽
  const handleMouseUp = useCallback(() => {
    if (!isDraggingRef.current) return

    const panel = panelRef.current
    const hasMoved = hasMovedRef.current

    isDraggingRef.current = false

    // 恢复文本选中
    document.body.style.userSelect = ""

    // 移除 dragging 类（但保持 left/top 样式，面板会停留在当前位置）
    panel?.classList.remove("dragging")

    // 边缘吸附检测
    if (edgeSnapHide && hasMoved && panel) {
      const rect = panel.getBoundingClientRect()
      // 使用传入的 snapThreshold 参数

      if (rect.left < snapThreshold) {
        onEdgeSnap?.("left")
      } else if (window.innerWidth - rect.right < snapThreshold) {
        onEdgeSnap?.("right")
      }
    }
  }, [edgeSnapHide, onEdgeSnap, snapThreshold])

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
    }
  }, [handleMouseDown, handleMouseMove, handleMouseUp, clampToViewport])

  return {
    panelRef,
    headerRef,
  }
}
