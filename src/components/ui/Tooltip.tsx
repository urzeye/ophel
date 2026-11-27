import React, { useCallback, useEffect, useId, useRef, useState } from "react"
import { createPortal } from "react-dom"
import type { ReactNode } from "react"

import {
  DEFAULT_TOOLTIP_DELAY_MS,
  DEFAULT_TOOLTIP_MAX_WIDTH,
  FOCUSABLE_SELECTOR,
  calculateTooltipPosition,
  ensureGlobalTooltipStyles,
  hasTruncatedText,
  isFocusFromWindowRestoration,
  markTooltipHidden,
  resolveTooltipPortalContainer,
  shouldSkipTooltipDelay,
  type TooltipCoordinates,
  type TooltipPlacement,
} from "~utils/dom-tooltip"

export {
  GLOBAL_TOOLTIP_STYLE_TEXT,
  bindDomTooltip,
  resolveTooltipPortalContainer,
} from "~utils/dom-tooltip"
export type {
  DomTooltipBinding,
  DomTooltipOptions,
  TooltipCoordinates,
  TooltipPlacement,
  TooltipPositionOptions,
} from "~utils/dom-tooltip"

export interface TooltipProps {
  content: string | ReactNode
  children: ReactNode
  placement?: TooltipPlacement
  maxWidth?: number | string
  delay?: number
  /** 仅当触发器内文本被截断（ellipsis/line-clamp）时才显示，用于列表项全文预览 */
  showOnlyWhenTruncated?: boolean
  className?: string
  triggerClassName?: string
  triggerStyle?: React.CSSProperties
  disabled?: boolean
}

export const Tooltip: React.FC<TooltipProps> = ({
  content,
  children,
  placement = "auto",
  maxWidth = DEFAULT_TOOLTIP_MAX_WIDTH,
  delay = DEFAULT_TOOLTIP_DELAY_MS,
  showOnlyWhenTruncated = false,
  className = "",
  triggerClassName = "",
  triggerStyle = {},
  disabled = false,
}) => {
  const [isVisible, setIsVisible] = useState(false)
  const [position, setPosition] = useState<TooltipCoordinates>({ top: 0, left: 0 })
  const [isMeasuring, setIsMeasuring] = useState(false)
  const [hasPendingTimer, setHasPendingTimer] = useState(false)
  const [portalContainer, setPortalContainer] = useState<Element | DocumentFragment | null>(null)

  const triggerRef = useRef<HTMLDivElement>(null)
  const tooltipRef = useRef<HTMLDivElement>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isHoveringRef = useRef(false)
  const isVisibleRef = useRef(false)
  const tooltipId = useId()

  const hideTooltip = useCallback(() => {
    isHoveringRef.current = false
    // 只在 tooltip 真实显示过时记录关闭时间，避免未显示的 hover 污染免延迟窗口
    if (isVisibleRef.current) {
      isVisibleRef.current = false
      markTooltipHidden()
    }
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
    setIsVisible(false)
    setIsMeasuring(false)
    setHasPendingTimer(false)
  }, [])

  const scheduleShow = useCallback(() => {
    const effectiveDelay = shouldSkipTooltipDelay() ? 0 : delay
    if (timerRef.current) {
      clearTimeout(timerRef.current)
    }
    setHasPendingTimer(true)
    timerRef.current = setTimeout(() => {
      timerRef.current = null
      setHasPendingTimer(false)
      // 二次检查：timer 到期时确认页面仍在前台且仍在 hover/focus 状态
      if (!document.hidden && isHoveringRef.current) {
        isVisibleRef.current = true
        setIsVisible(true)
        setIsMeasuring(true)
      }
    }, effectiveDelay)
  }, [delay])

  // 截断门控：文本完整可见时 tooltip 没有增量信息，不显示
  const passesTruncationGate = useCallback((): boolean => {
    if (!showOnlyWhenTruncated) return true
    const trigger = triggerRef.current
    return trigger !== null && hasTruncatedText(trigger)
  }, [showOnlyWhenTruncated])

  const showTooltip = useCallback(() => {
    isHoveringRef.current = true
    if (disabled) return
    if (!passesTruncationGate()) return
    scheduleShow()
  }, [disabled, passesTruncationGate, scheduleShow])

  // 针对切标签页/窗口回来时浏览器自动恢复焦点的场景，
  // 屏蔽由页面恢复焦点触发的 showTooltip（非用户主动键盘导航）
  const showTooltipFromFocus = useCallback(
    (event: React.FocusEvent) => {
      if (isFocusFromWindowRestoration()) return
      // 弹窗关闭后程序化恢复焦点（如设置弹窗把焦点还给设置按钮）不匹配
      // :focus-visible；仅键盘导航聚焦时才通过 focus 显示 tooltip，
      // 避免鼠标操作链路下 tooltip 凭空出现
      if (!event.target.matches(":focus-visible")) return
      showTooltip()
    },
    [showTooltip],
  )

  const updatePosition = useCallback(() => {
    const triggerRect = triggerRef.current?.getBoundingClientRect()
    const tooltipRect = tooltipRef.current?.getBoundingClientRect()
    if (!triggerRect || !tooltipRect) return

    setPosition(
      calculateTooltipPosition(triggerRect, tooltipRect, { preferredPlacement: placement }),
    )
  }, [placement])

  useEffect(() => {
    if (triggerRef.current) {
      const container = resolveTooltipPortalContainer(triggerRef.current)
      setPortalContainer(container)
      ensureGlobalTooltipStyles(container)
    }
  }, [])

  useEffect(() => {
    if ((isVisible || isMeasuring) && triggerRef.current) {
      updatePosition()
      if (isMeasuring) {
        setIsMeasuring(false)
      }
    }
  }, [content, isMeasuring, isVisible, updatePosition])

  useEffect(() => {
    if (!(isVisible || isMeasuring)) return

    const handleWindowChange = () => {
      updatePosition()
    }

    window.addEventListener("scroll", handleWindowChange, true)
    window.addEventListener("resize", handleWindowChange)

    return () => {
      window.removeEventListener("scroll", handleWindowChange, true)
      window.removeEventListener("resize", handleWindowChange)
    }
  }, [isMeasuring, isVisible, updatePosition])

  // 只在有 pending timer 或 tooltip 可见时才注册监听器，避免多实例常驻导致不必要开销
  useEffect(() => {
    if (!hasPendingTimer && !isVisible && !isMeasuring) return

    const handleVisibilityChange = () => {
      if (document.hidden) {
        hideTooltip()
      }
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        hideTooltip()
      }
    }

    window.addEventListener("blur", hideTooltip)
    window.addEventListener("keydown", handleKeyDown)
    document.addEventListener("visibilitychange", handleVisibilityChange)

    return () => {
      window.removeEventListener("blur", hideTooltip)
      window.removeEventListener("keydown", handleKeyDown)
      document.removeEventListener("visibilitychange", handleVisibilityChange)
    }
  }, [hasPendingTimer, hideTooltip, isMeasuring, isVisible])

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [])

  // 与 DOM tooltip 路径对齐：可见时把浮层 id 关联到实际可聚焦元素，
  // 让读屏器能感知提示内容；不可见时移除，避免悬空引用
  useEffect(() => {
    const trigger = triggerRef.current
    if (!trigger) return

    const focusable = trigger.matches(FOCUSABLE_SELECTOR)
      ? trigger
      : trigger.querySelector<HTMLElement>(FOCUSABLE_SELECTOR)
    const target = focusable ?? trigger

    if (isVisible) {
      target.setAttribute("aria-describedby", tooltipId)
    } else {
      target.removeAttribute("aria-describedby")
    }

    return () => {
      target.removeAttribute("aria-describedby")
    }
  }, [isVisible, tooltipId])

  useEffect(() => {
    if (disabled) {
      hideTooltip()
    } else if (isHoveringRef.current && passesTruncationGate()) {
      scheduleShow()
    }
  }, [disabled, hideTooltip, passesTruncationGate, scheduleShow])

  return (
    <div
      ref={triggerRef}
      className={`ophel-tooltip-trigger ${className} ${triggerClassName}`}
      onMouseEnter={showTooltip}
      onMouseLeave={hideTooltip}
      onFocus={showTooltipFromFocus}
      onBlur={hideTooltip}
      onClick={hideTooltip}
      onPointerDown={hideTooltip}
      style={{ display: "inline-flex", ...triggerStyle }}>
      {children}
      {isVisible &&
        content &&
        portalContainer &&
        createPortal(
          <div
            ref={tooltipRef}
            id={tooltipId}
            className="ophel-tooltip"
            style={{
              position: "fixed",
              top: position.top,
              left: position.left,
              maxWidth: maxWidth,
              opacity: isMeasuring ? 0 : 1,
            }}>
            {content}
          </div>,
          portalContainer,
        )}
    </div>
  )
}
