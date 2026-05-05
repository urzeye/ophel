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

const PANEL_HORIZONTAL_MARGIN = 0
const PANEL_VERTICAL_MARGIN = 10

export function useDraggable(options: UseDraggableOptions = {}) {
  const { edgeSnapHide = false, edgeSnapState, snapThreshold = 30, onEdgeSnap, onUnsnap } = options

  const panelRef = useRef<HTMLDivElement>(null)
  const headerRef = useRef<HTMLDivElement>(null)

  // 使用 Ref 存储实时状态，避免触发 React 渲染
  const isDraggingRef = useRef(false)
  const hasMovedRef = useRef(false)
  const offsetRef = useRef({ x: 0, y: 0 })

  // 延迟取消吸附：记录 mousedown 时的吸附状态，仅在实际拖拽移动时才执行取消
  // 这样单击/双击不会导致面板脱离吸附
  const pendingUnsnapRef = useRef<"left" | "right" | null>(null)
  // 动画 RAF ID，用于组件卸载时取消
  const animationRafRef = useRef<number | null>(null)
  const cssVerticalCenterClampedRef = useRef(false)
  // 面板位置比例（相对于可移动轨道），用于在缩放时等比恢复位置，防止累积漂移
  // 仅在非吸附的 floating 模式下，拖拽结束后保存；吸附模式由 CSS class 控制，不需要
  const positionRatioRef = useRef<{ xRatio: number; yRatio: number } | null>(null)

  const toTrackRatio = useCallback(
    (value: number, viewport: number, size: number, margin: number) => {
      const max = Math.max(margin, viewport - size - margin)
      const usable = Math.max(1, max - margin)
      return Math.min(1, Math.max(0, (value - margin) / usable))
    },
    [],
  )

  const fromTrackRatio = useCallback(
    (ratio: number, viewport: number, size: number, margin: number) => {
      const max = Math.max(margin, viewport - size - margin)
      const usable = Math.max(1, max - margin)
      return margin + ratio * usable
    },
    [],
  )

  const readPositionRatio = useCallback(
    (rect: DOMRect, vw = window.innerWidth, vh = window.innerHeight) => ({
      xRatio: toTrackRatio(rect.left, vw, rect.width, PANEL_HORIZONTAL_MARGIN),
      yRatio: toTrackRatio(rect.top, vh, rect.height, PANEL_VERTICAL_MARGIN),
    }),
    [toTrackRatio],
  )

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
        cssVerticalCenterClampedRef.current = false

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

    // 拖拽完成后将位置存为比例，供 resize/zoom 时等比恢复
    if (hasMoved && panel && !edgeSnapHide) {
      const rect = panel.getBoundingClientRect()
      positionRatioRef.current = readPositionRatio(rect)
    }

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
      } else {
        // 未触发吸附，面板停留在当前位置，保存比例用于 zoom 恢复
        positionRatioRef.current = readPositionRatio(rect, vw, window.innerHeight)
      }
    }
  }, [edgeSnapHide, onEdgeSnap, snapThreshold, animateToPosition, readPositionRatio])

  // 边界检测：确保面板在视口内可见
  // positionRatioRef 代表用户意图位置，只能由拖拽或初次像素定位接管时写入。
  // resize/zoom 只根据意图计算当前显示坐标，不能把 clamp 后的坐标写回意图。
  const clampToViewport = useCallback(() => {
    const panel = panelRef.current
    if (!panel) return

    // 跳过条件：处于吸附状态
    if (edgeSnapState) return

    const vw = window.innerWidth
    const vh = window.innerHeight
    const rect = panel.getBoundingClientRect()

    if (!positionRatioRef.current) {
      const leftStyle = panel.style.left
      const isDomManagedPixelPosition = Boolean(
        leftStyle && leftStyle !== "auto" && panel.style.transform === "none",
      )

      if (!isDomManagedPixelPosition) {
        // CSS 横向贴边定位本身会随 layout viewport 正确变化。
        // 此时不要写入 left/right；纵向若从默认居中被临时 clamp，空间恢复后要还原居中意图。
        const isDefaultVerticalCenter = panel.style.transform !== "none"
        const canFitWhenCentered = rect.height + PANEL_VERTICAL_MARGIN * 2 <= vh

        if (
          (isDefaultVerticalCenter || cssVerticalCenterClampedRef.current) &&
          canFitWhenCentered
        ) {
          if (cssVerticalCenterClampedRef.current) {
            panel.style.top = "50%"
            panel.style.transform = "translateY(-50%)"
            cssVerticalCenterClampedRef.current = false
          }
          return
        }

        if (isDefaultVerticalCenter) {
          cssVerticalCenterClampedRef.current = true
        }

        let nextTop = rect.top
        if (nextTop + rect.height + PANEL_VERTICAL_MARGIN > vh) {
          nextTop = vh - rect.height - PANEL_VERTICAL_MARGIN
        }
        if (nextTop < PANEL_VERTICAL_MARGIN) nextTop = PANEL_VERTICAL_MARGIN

        if (Math.abs(nextTop - rect.top) > 0.5) {
          panel.style.top = nextTop + "px"
          panel.style.transform = "none"
        }
        return
      }

      positionRatioRef.current = readPositionRatio(rect, vw, vh)
    }

    const ratio = positionRatioRef.current
    let newLeft = ratio
      ? fromTrackRatio(ratio.xRatio, vw, rect.width, PANEL_HORIZONTAL_MARGIN)
      : rect.left
    let newTop = ratio
      ? fromTrackRatio(ratio.yRatio, vh, rect.height, PANEL_VERTICAL_MARGIN)
      : rect.top

    // 统一 clamp 到视口边界
    if (newLeft + rect.width + PANEL_HORIZONTAL_MARGIN > vw) {
      newLeft = vw - rect.width - PANEL_HORIZONTAL_MARGIN
    }
    if (newTop + rect.height + PANEL_VERTICAL_MARGIN > vh) {
      newTop = vh - rect.height - PANEL_VERTICAL_MARGIN
    }
    if (newLeft < PANEL_HORIZONTAL_MARGIN) newLeft = PANEL_HORIZONTAL_MARGIN
    if (newTop < PANEL_VERTICAL_MARGIN) newTop = PANEL_VERTICAL_MARGIN

    // 只有位置确实变化才写入 DOM（避免无效写入打断 CSS 动画）
    if (Math.abs(newLeft - rect.left) > 0.5 || Math.abs(newTop - rect.top) > 0.5) {
      panel.style.left = newLeft + "px"
      panel.style.top = newTop + "px"
      panel.style.right = "auto"
      panel.style.transform = "none"
    }
  }, [edgeSnapState, fromTrackRatio, readPositionRatio])

  // 进入 edge-snap 时清空 positionRatioRef。
  // 退出 edge-snap 切回 floating 后，MainPanel 会把面板定位到新位置，
  // 此时 ratio 为 null，下次 resize/zoom 触发 clampToViewport 时
  // 由 hasPixelPosition 分支从当前新位置重新初始化，避免跳回旧 floating 坐标。
  useEffect(() => {
    if (edgeSnapState) {
      positionRatioRef.current = null
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
