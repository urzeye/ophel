/**
 * 面板拖拽 Hook
 *
 * 与油猴脚本 makeDraggable() 逻辑一致：
 * - 通过 header 拖拽移动面板
 * - 拖拽结束时检测边缘吸附
 * - 窗口 resize 时边界检测
 */

import { useCallback, useEffect, useRef, useState } from "react"

interface DragState {
  isDragging: boolean
  hasDragged: boolean
  position: { left: number; top: number } | null
}

interface UseDraggableOptions {
  edgeSnapHide?: boolean
  edgeSnapState?: "left" | "right" | null // 当前吸附状态
  onEdgeSnap?: (side: "left" | "right") => void
  onUnsnap?: () => void
}

export function useDraggable(options: UseDraggableOptions = {}) {
  const { edgeSnapHide = false, edgeSnapState, onEdgeSnap, onUnsnap } = options

  const panelRef = useRef<HTMLDivElement>(null)
  const headerRef = useRef<HTMLDivElement>(null)

  const [dragState, setDragState] = useState<DragState>({
    isDragging: false,
    hasDragged: false,
    position: null,
  })

  // 当吸附状态变化时，重置拖拽位置状态
  // 这样可以避免旧的位置数据干扰吸附状态下的 CSS 定位
  useEffect(() => {
    if (edgeSnapState) {
      // 进入吸附状态时，清除位置状态，让 CSS 类完全控制位置
      setDragState((prev) => ({
        ...prev,
        hasDragged: false,
        position: null,
      }))
    }
  }, [edgeSnapState])

  // 记录拖拽是否发生过实质性移动（避免点击触发吸附）
  const hasMovedRef = useRef(false)
  // ⭐ 追踪是否真正在拖拽中（用于 handleMouseUp 的检查）
  const isDraggingRef = useRef(false)

  // 拖拽偏移量（鼠标相对于面板左上角的偏移）
  const offsetRef = useRef({ x: 0, y: 0 })

  // 开始拖拽
  const handleMouseDown = useCallback((e: MouseEvent) => {
    // 排除控制按钮区域
    if ((e.target as Element).closest(".gh-panel-controls")) return

    const panel = panelRef.current
    if (!panel) return

    e.preventDefault() // 阻止文本选中

    // 读取面板当前的实际位置
    const rect = panel.getBoundingClientRect()

    // 计算鼠标相对于面板左上角的偏移
    offsetRef.current = {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    }

    hasMovedRef.current = false // 重置移动标记
    isDraggingRef.current = true // ⭐ 标记开始拖拽

    // 只设置 isDragging=true，不设置 hasDragged 和 position
    // 只有在 mousemove 检测到实际移动时才更新位置
    setDragState((prev) => ({
      ...prev,
      isDragging: true,
    }))

    // 拖动时禁止全局文本选中
    document.body.style.userSelect = "none"
  }, [])

  // 拖拽移动
  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      setDragState((prev) => {
        if (!prev.isDragging) return prev

        e.preventDefault()

        // 首次移动时取消吸附状态并标记已拖拽
        if (!hasMovedRef.current) {
          hasMovedRef.current = true
          // 使用 setTimeout 避免在 setDragState 回调中直接调用外部状态更新
          setTimeout(() => onUnsnap?.(), 0)
        }

        // 直接计算面板左上角位置 = 鼠标位置 - 初始偏移
        return {
          ...prev,
          hasDragged: true, // 标记发生过拖拽
          position: {
            left: e.clientX - offsetRef.current.x,
            top: e.clientY - offsetRef.current.y,
          },
        }
      })
    },
    [onUnsnap],
  )

  // 结束拖拽
  const handleMouseUp = useCallback(() => {
    // 先获取需要的状态
    const panel = panelRef.current
    const hasMoved = hasMovedRef.current
    // ⭐ 使用 ref 获取实时的拖拽状态，这比 state 更新更及时且同步
    const wasDragging = isDraggingRef.current

    setDragState((prev) => {
      if (!prev.isDragging) return prev

      // 恢复文本选中
      document.body.style.userSelect = ""

      return { ...prev, isDragging: false }
    })

    // 重置 ref 状态
    isDraggingRef.current = false

    // 边缘吸附检测 (在 setDragState 之后执行，避免渲染期间状态更新警告)
    // ⭐ 使用 wasDragging ref 值检查，确保只在真正拖拽结束时才检测
    // 这样可以完美过滤掉点击按钮（如展开面板）产生的 mouseup 事件，因为点击按钮不会将 isDraggingRef 设为 true
    if (edgeSnapHide && wasDragging && hasMoved && panel) {
      setTimeout(() => {
        const rect = panel.getBoundingClientRect()
        const snapThreshold = 30 // 距离边缘30px时触发吸附

        if (rect.left < snapThreshold) {
          onEdgeSnap?.("left")
        } else if (window.innerWidth - rect.right < snapThreshold) {
          onEdgeSnap?.("right")
        }
      }, 0)
    }
  }, [edgeSnapHide, onEdgeSnap])

  // 边界检测：确保面板在视口内可见
  const clampToViewport = useCallback(() => {
    setDragState((prev) => {
      if (!prev.hasDragged || !prev.position || !panelRef.current) return prev

      const rect = panelRef.current.getBoundingClientRect()
      const vw = window.innerWidth
      const vh = window.innerHeight
      const margin = 10

      let newLeft = prev.position.left
      let newTop = prev.position.top

      // 超出边界检测
      if (rect.right > vw) newLeft = vw - rect.width - margin
      if (rect.bottom > vh) newTop = vh - rect.height - margin
      if (rect.left < 0) newLeft = margin
      if (rect.top < 0) newTop = margin

      if (newLeft !== prev.position.left || newTop !== prev.position.top) {
        return { ...prev, position: { left: newLeft, top: newTop } }
      }
      return prev
    })
  }, [])

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

  // 计算面板样式
  const panelStyle: React.CSSProperties = dragState.position
    ? {
        left: `${dragState.position.left}px`,
        top: `${dragState.position.top}px`,
        right: "auto",
        transform: "none",
      }
    : {}

  return {
    panelRef,
    headerRef,
    panelStyle,
    isDragging: dragState.isDragging,
    hasDragged: dragState.hasDragged,
  }
}
