import React, { useEffect, useRef, useState } from "react"

import type { SiteAdapter } from "~adapters/base"
import { Tooltip } from "~components/ui/Tooltip"
import { t } from "~utils/i18n"

interface SelectedPromptBarProps {
  title: string
  onClear: () => void
  adapter?: SiteAdapter | null
}

export const SelectedPromptBar: React.FC<SelectedPromptBarProps> = ({
  title,
  onClear,
  adapter,
}) => {
  const [bottomPosition, setBottomPosition] = useState(120)
  const resizeObserverRef = useRef<ResizeObserver | null>(null)
  const observedElementRef = useRef<Element | null>(null)

  // 查找输入框容器（向上遍历找到有圆角边框的容器）
  const findInputContainer = (textarea: HTMLElement): Element => {
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
  }

  // 动态更新悬浮条位置（基于输入框容器位置）
  const updatePosition = () => {
    const textarea = adapter?.getTextareaElement()

    // 如果没有输入框引用或输入框不在 DOM 中，使用默认位置
    if (!textarea || !textarea.isConnected) {
      setBottomPosition(120)
      return
    }

    const inputContainer = findInputContainer(textarea)
    const containerRect = inputContainer.getBoundingClientRect()
    const viewportHeight = window.innerHeight

    // 悬浮条显示在输入容器上方，保持 20px 间距
    const desiredBottom = viewportHeight - containerRect.top + 20

    // 确保不会太靠近顶部（最小 50px 距顶），也不会太靠近底部
    const clampedBottom = Math.max(50, Math.min(desiredBottom, viewportHeight - 50))
    setBottomPosition(clampedBottom)

    // 如果容器元素变了，需要重新建立 ResizeObserver 监听
    if (inputContainer !== observedElementRef.current && resizeObserverRef.current) {
      if (observedElementRef.current) {
        resizeObserverRef.current.unobserve(observedElementRef.current)
      }
      resizeObserverRef.current.observe(inputContainer)
      observedElementRef.current = inputContainer
    }
  }

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

    // 监听窗口大小变化
    window.addEventListener("resize", updatePosition)

    return () => {
      window.removeEventListener("resize", updatePosition)
      timeoutIds.forEach((id) => clearTimeout(id))
      if (resizeObserverRef.current) {
        resizeObserverRef.current.disconnect()
        resizeObserverRef.current = null
      }
      observedElementRef.current = null
    }
  }, [title, adapter])

  if (!title) return null

  return (
    <div
      className="selected-prompt-bar gh-interactive"
      style={{
        position: "fixed",
        bottom: `${bottomPosition}px`,
        left: "50%",
        transform: "translateX(-50%)",
        // 使用渐变背景
        background: "var(--gh-brand-gradient)",
        color: "var(--gh-text-on-primary, white)",
        padding: "8px 16px",
        borderRadius: "20px",
        boxShadow: "var(--gh-shadow-brand)",
        display: "flex",
        alignItems: "center",
        gap: "8px",
        zIndex: 999998,
        maxWidth: "80%",
        animation: "slideInUp 0.3s ease",
        userSelect: "none",
        transition: "bottom 0.2s ease",
      }}>
      <style>{`
        @keyframes slideInUp {
          from {
            transform: translate(-50%, 20px);
            opacity: 0;
          }
          to {
            transform: translate(-50%, 0);
            opacity: 1;
          }
        }
      `}</style>
      <span
        style={{
          fontSize: "12px",
          color: "var(--gh-text-on-primary, rgba(255,255,255,0.8))",
          whiteSpace: "nowrap",
          userSelect: "none",
        }}>
        {t("currentPrompt") || "当前提示词"}:
      </span>
      <Tooltip content={title}>
        <span
          className="selected-prompt-text"
          style={{
            fontSize: "13px",
            fontWeight: 500,
            color: "var(--gh-text-on-primary, white)",
            maxWidth: "300px",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
            userSelect: "none",
          }}>
          {title}
        </span>
      </Tooltip>
      <Tooltip content={t("clear") || "清除"}>
        <button
          className="clear-prompt-btn"
          onClick={onClear}
          style={{
            background: "var(--gh-glass-bg, rgba(255,255,255,0.2))",
            border: "none",
            color: "var(--gh-text-on-primary, white)",
            width: "20px",
            height: "20px",
            borderRadius: "50%",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: "14px",
            lineHeight: "1",
            padding: 0,
            marginLeft: "4px",
            transition: "all 0.2s",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = "var(--gh-glass-bg-hover, rgba(255,255,255,0.3))"
            e.currentTarget.style.transform = "scale(1.1)"
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = "var(--gh-glass-bg, rgba(255,255,255,0.2))"
            e.currentTarget.style.transform = "scale(1)"
          }}>
          ×
        </button>
      </Tooltip>
    </div>
  )
}
