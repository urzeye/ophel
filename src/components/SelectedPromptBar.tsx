import React, { useCallback, useEffect, useRef, useState } from "react"

import type { SiteAdapter } from "~adapters/base"
import { ClearIcon } from "~components/icons"
import { Tooltip } from "~components/ui/Tooltip"
import { t } from "~utils/i18n"

interface SelectedPromptBarProps {
  title: string
  onClear: () => void
  adapter?: SiteAdapter | null
}

interface InputLayoutSnapshot {
  left: number
  top: number
  width: number
  height: number
  viewportHeight: number
}

const DEFAULT_BOTTOM_POSITION = 120
const DEFAULT_LEFT_POSITION = "50%"
const INPUT_CONTAINER_GAP_PX = 6
const VIEWPORT_SAFE_MARGIN_PX = 50

export const SelectedPromptBar: React.FC<SelectedPromptBarProps> = ({
  title,
  onClear,
  adapter,
}) => {
  const [bottomPosition, setBottomPosition] = useState(DEFAULT_BOTTOM_POSITION)
  const [leftPosition, setLeftPosition] = useState(DEFAULT_LEFT_POSITION)
  const resizeObserverRef = useRef<ResizeObserver | null>(null)
  const observedElementRef = useRef<Element | null>(null)
  const lastLayoutSnapshotRef = useRef<InputLayoutSnapshot | null>(null)

  // 查找输入框容器（向上遍历找到有圆角边框的容器）
  const findInputContainer = useCallback((textarea: HTMLElement): Element => {
    let inputContainer: Element = textarea
    let parent = textarea.parentElement
    for (let i = 0; i < 10 && parent && parent !== document.body; i++) {
      const style = window.getComputedStyle(parent)
      if (style.borderRadius && parseFloat(style.borderRadius) > 0) {
        inputContainer = parent
        break
      }
      parent = parent.parentElement
    }
    return inputContainer
  }, [])

  // 动态更新悬浮条位置（基于输入框容器位置）
  const updatePosition = useCallback(() => {
    const textarea = adapter?.getTextareaElement()

    // 如果没有输入框引用或输入框不在 DOM 中，使用默认位置
    if (!textarea || !textarea.isConnected) {
      setBottomPosition((current) =>
        current === DEFAULT_BOTTOM_POSITION ? current : DEFAULT_BOTTOM_POSITION,
      )
      setLeftPosition((current) =>
        current === DEFAULT_LEFT_POSITION ? current : DEFAULT_LEFT_POSITION,
      )
      lastLayoutSnapshotRef.current = null
      return
    }

    const observedElement = observedElementRef.current
    const inputContainer =
      observedElement && observedElement.isConnected && observedElement.contains(textarea)
        ? observedElement
        : findInputContainer(textarea)
    const containerRect = inputContainer.getBoundingClientRect()
    const viewportHeight = window.innerHeight
    const layoutSnapshot: InputLayoutSnapshot = {
      left: Math.round(containerRect.left),
      top: Math.round(containerRect.top),
      width: Math.round(containerRect.width),
      height: Math.round(containerRect.height),
      viewportHeight,
    }

    // 如果容器元素变了，需要重新建立 ResizeObserver 监听
    if (inputContainer !== observedElementRef.current && resizeObserverRef.current) {
      if (observedElementRef.current) {
        resizeObserverRef.current.unobserve(observedElementRef.current)
      }
      resizeObserverRef.current.observe(inputContainer)
      observedElementRef.current = inputContainer
    }

    const lastLayoutSnapshot = lastLayoutSnapshotRef.current
    if (
      lastLayoutSnapshot &&
      lastLayoutSnapshot.left === layoutSnapshot.left &&
      lastLayoutSnapshot.top === layoutSnapshot.top &&
      lastLayoutSnapshot.width === layoutSnapshot.width &&
      lastLayoutSnapshot.height === layoutSnapshot.height &&
      lastLayoutSnapshot.viewportHeight === layoutSnapshot.viewportHeight
    ) {
      return
    }
    lastLayoutSnapshotRef.current = layoutSnapshot

    // 悬浮条紧贴输入容器上方，避免遮挡输入框上方的站点原生提示文案。
    const desiredBottom = viewportHeight - layoutSnapshot.top + INPUT_CONTAINER_GAP_PX

    // 确保不会太靠近顶部（最小 50px 距顶），也不会太靠近底部
    const clampedBottom = Math.max(
      VIEWPORT_SAFE_MARGIN_PX,
      Math.min(desiredBottom, viewportHeight - VIEWPORT_SAFE_MARGIN_PX),
    )
    setBottomPosition((current) => (current === clampedBottom ? current : clampedBottom))

    // 横向跟随输入容器中心，避免在有侧边栏时按整个页面居中。
    const nextLeftPosition = `${Math.round(layoutSnapshot.left + layoutSnapshot.width / 2)}px`
    setLeftPosition((current) => (current === nextLeftPosition ? current : nextLeftPosition))
  }, [adapter, findInputContainer])

  useEffect(() => {
    if (!title) return

    const textarea = adapter?.getTextareaElement()

    // 创建 ResizeObserver 监听输入框容器尺寸变化
    resizeObserverRef.current = new ResizeObserver(() => {
      updatePosition()
    })

    // 如果能找到输入框，开始监听其容器
    if (textarea) {
      const inputContainer = findInputContainer(textarea)
      resizeObserverRef.current.observe(inputContainer)
      observedElementRef.current = inputContainer
    }

    // 初始更新位置
    updatePosition()

    // 选中时多次延迟更新（处理输入框容器还未渲染完成的情况）
    const delays = [50, 200, 400]
    const timeoutIds = delays.map((delay) => setTimeout(updatePosition, delay))

    // 跟随 CSS transition / transform 引起的位置变化，例如站点侧边栏展开收起。
    let animationFrameId: number | null = null
    const trackPosition = () => {
      updatePosition()
      animationFrameId = window.requestAnimationFrame(trackPosition)
    }
    animationFrameId = window.requestAnimationFrame(trackPosition)

    // 监听窗口大小变化
    window.addEventListener("resize", updatePosition)

    return () => {
      window.removeEventListener("resize", updatePosition)
      timeoutIds.forEach((id) => clearTimeout(id))
      if (animationFrameId !== null) {
        window.cancelAnimationFrame(animationFrameId)
      }
      if (resizeObserverRef.current) {
        resizeObserverRef.current.disconnect()
        resizeObserverRef.current = null
      }
      observedElementRef.current = null
      lastLayoutSnapshotRef.current = null
    }
  }, [title, adapter, findInputContainer, updatePosition])

  if (!title) return null

  return (
    <div
      className="selected-prompt-bar gh-interactive"
      style={{
        position: "fixed",
        bottom: `${bottomPosition}px`,
        left: leftPosition,
        transform: "translateX(-50%)",
        zIndex: 999998,
      }}>
      <span className="selected-prompt-label">{t("currentPrompt") || "当前提示词"}</span>
      <Tooltip content={title}>
        <span className="selected-prompt-text">{title}</span>
      </Tooltip>
      <Tooltip content={t("clear") || "清除"}>
        <button
          className="clear-prompt-btn"
          type="button"
          aria-label={t("clear") || "清除"}
          onClick={onClear}>
          <ClearIcon size={14} />
        </button>
      </Tooltip>
    </div>
  )
}
