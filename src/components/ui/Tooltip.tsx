import React, { useCallback, useEffect, useId, useRef, useState } from "react"
import { createPortal } from "react-dom"
import type { ReactNode } from "react"

const GLOBAL_TOOLTIP_STYLE_ID = "ophel-global-tooltip-styles"
const DEFAULT_TOOLTIP_DELAY_MS = 300
const DEFAULT_TOOLTIP_MAX_WIDTH = 260
const DEFAULT_TOOLTIP_GAP = 8
const DEFAULT_VIEWPORT_PADDING = 10
const SKIP_DELAY_WINDOW_MS = 300
const FOCUSABLE_SELECTOR = 'button, a[href], input, [tabindex], [role="button"]'

// 连续悬停免延迟：一个 tooltip 刚关闭的短窗口内，相邻触发器立即显示。
// 模块级共享，等价于 Radix 的 skipDelayDuration，天然覆盖同组按钮互扫场景。
let lastTooltipHiddenAt = 0

// 切换标签页/窗口回来时浏览器会自动恢复焦点到上次聚焦的元素，
// 触发 onFocus → showTooltip，导致 tooltip 凭空出现。
// 用模块级 flag 标记“刚从 window.focus 恢复”，在此期间屏蔽 element focus 事件。
// 广播防重：用 window 属性标记，避免 HMR/多次导入时重复注册。
function isFocusFromWindowRestoration(): boolean {
  return window.__ophelTooltipSuppressFocusFromWindowRestoration__ === true
}

;(function registerWindowFocusSuppressionListener() {
  if (typeof window === "undefined") return
  const win = window
  if (typeof win.__ophelTooltipSuppressFocusFromWindowRestoration__ !== "boolean") {
    win.__ophelTooltipSuppressFocusFromWindowRestoration__ = false
  }
  if (win.__ophelTooltipWindowFocusListenerRegistered__) return
  win.__ophelTooltipWindowFocusListenerRegistered__ = true
  window.addEventListener("focus", () => {
    window.__ophelTooltipSuppressFocusFromWindowRestoration__ = true
    requestAnimationFrame(() => {
      window.__ophelTooltipSuppressFocusFromWindowRestoration__ = false
    })
  })
})()

export const GLOBAL_TOOLTIP_STYLE_TEXT = `
  .ophel-tooltip {
    background-color: rgba(24, 24, 28, 0.94);
    color: #ffffff;
    padding: 4px 8px;
    border-radius: 4px;
    font-size: 12px;
    line-height: 1.35;
    z-index: 2147483647;
    pointer-events: none;
    white-space: pre-wrap;
    word-wrap: break-word;
    box-shadow: 0 3px 10px rgba(0, 0, 0, 0.25);
    border: 1px solid rgba(255, 255, 255, 0.12);
    backdrop-filter: blur(6px);
    animation: tooltip-fade-in 0.12s ease-out;
  }

  @keyframes tooltip-fade-in {
    from {
      opacity: 0;
      transform: scale(0.96);
    }
    to {
      opacity: 1;
      transform: scale(1);
    }
  }
`

export type TooltipPlacement = "top" | "bottom" | "left" | "right" | "auto"

export interface TooltipPositionOptions {
  preferredPlacement?: TooltipPlacement
  gap?: number
  viewportPadding?: number
}

export interface TooltipCoordinates {
  top: number
  left: number
}

export interface DomTooltipBinding {
  hide: () => void
  destroy: () => void
}

export interface DomTooltipOptions extends TooltipPositionOptions {
  getContent: () => string
  delay?: number
  maxWidth?: number | string
  disabled?: boolean | (() => boolean)
}

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

// 文本截断检测：比较 scroll/client 尺寸，同时覆盖单行 ellipsis 与多行 line-clamp
function hasTruncatedText(root: HTMLElement): boolean {
  const isOverflowing = (el: Element): boolean =>
    el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1

  if (isOverflowing(root)) return true
  for (const el of Array.from(root.querySelectorAll("*"))) {
    if (isOverflowing(el)) return true
  }
  return false
}

function resolveDisabled(disabled: DomTooltipOptions["disabled"]): boolean {
  return typeof disabled === "function" ? disabled() : Boolean(disabled)
}

export function resolveTooltipPortalContainer(
  triggerNode: Node | null,
): Element | DocumentFragment | null {
  if (!triggerNode || typeof document === "undefined") {
    return null
  }

  const root = triggerNode.getRootNode?.()
  if (root instanceof ShadowRoot) {
    return root
  }

  return document.body
}

export function ensureGlobalTooltipStyles(container: Element | DocumentFragment | null): void {
  if (typeof document === "undefined" || !container || container instanceof ShadowRoot) {
    return
  }

  if (document.getElementById(GLOBAL_TOOLTIP_STYLE_ID)) {
    return
  }

  const style = document.createElement("style")
  style.id = GLOBAL_TOOLTIP_STYLE_ID
  style.textContent = GLOBAL_TOOLTIP_STYLE_TEXT
  document.head.appendChild(style)
}

export function calculateTooltipPosition(
  triggerRect: DOMRect,
  tooltipRect: Pick<DOMRect, "width" | "height">,
  options: TooltipPositionOptions = {},
): TooltipCoordinates {
  const {
    preferredPlacement = "auto",
    gap = DEFAULT_TOOLTIP_GAP,
    viewportPadding = DEFAULT_VIEWPORT_PADDING,
  } = options

  if (typeof window === "undefined") {
    return { top: 0, left: 0 }
  }

  const spaceTop = triggerRect.top - viewportPadding
  const spaceBottom = window.innerHeight - triggerRect.bottom - viewportPadding
  const spaceLeft = triggerRect.left - viewportPadding
  const spaceRight = window.innerWidth - triggerRect.right - viewportPadding

  const neededHeight = tooltipRect.height + gap
  const neededWidth = tooltipRect.width + gap

  let resolvedPlacement: "top" | "bottom" | "left" | "right" = "bottom"

  if (preferredPlacement === "top") {
    if (spaceTop >= neededHeight) {
      resolvedPlacement = "top"
    } else if (spaceBottom >= neededHeight) {
      resolvedPlacement = "bottom"
    } else {
      resolvedPlacement = spaceTop >= spaceBottom ? "top" : "bottom"
    }
  } else if (preferredPlacement === "bottom") {
    if (spaceBottom >= neededHeight) {
      resolvedPlacement = "bottom"
    } else if (spaceTop >= neededHeight) {
      resolvedPlacement = "top"
    } else {
      resolvedPlacement = spaceBottom >= spaceTop ? "bottom" : "top"
    }
  } else if (preferredPlacement === "left") {
    if (spaceLeft >= neededWidth) {
      resolvedPlacement = "left"
    } else if (spaceRight >= neededWidth) {
      resolvedPlacement = "right"
    } else {
      resolvedPlacement = spaceLeft >= spaceRight ? "left" : "right"
    }
  } else if (preferredPlacement === "right") {
    if (spaceRight >= neededWidth) {
      resolvedPlacement = "right"
    } else if (spaceLeft >= neededWidth) {
      resolvedPlacement = "left"
    } else {
      resolvedPlacement = spaceRight >= spaceLeft ? "right" : "left"
    }
  } else {
    // "auto": vertical first if space suffices, prefer bottom unless bottom is too tight
    if (spaceBottom >= neededHeight) {
      resolvedPlacement = "bottom"
    } else if (spaceTop >= neededHeight) {
      resolvedPlacement = "top"
    } else if (spaceLeft >= neededWidth) {
      resolvedPlacement = "left"
    } else if (spaceRight >= neededWidth) {
      resolvedPlacement = "right"
    } else {
      resolvedPlacement = spaceBottom >= spaceTop ? "bottom" : "top"
    }
  }

  let top = 0
  let left = 0

  if (resolvedPlacement === "top" || resolvedPlacement === "bottom") {
    top =
      resolvedPlacement === "top"
        ? triggerRect.top - tooltipRect.height - gap
        : triggerRect.bottom + gap

    // Clamp top to viewport bounds
    top = Math.max(
      viewportPadding,
      Math.min(window.innerHeight - tooltipRect.height - viewportPadding, top),
    )

    // Center horizontally and clamp to viewport bounds
    left = triggerRect.left + triggerRect.width / 2 - tooltipRect.width / 2
    left = Math.max(
      viewportPadding,
      Math.min(window.innerWidth - tooltipRect.width - viewportPadding, left),
    )
  } else {
    // "left" or "right"
    left =
      resolvedPlacement === "left"
        ? triggerRect.left - tooltipRect.width - gap
        : triggerRect.right + gap

    // Clamp left to viewport bounds
    left = Math.max(
      viewportPadding,
      Math.min(window.innerWidth - tooltipRect.width - viewportPadding, left),
    )

    // Center vertically and clamp to viewport bounds
    top = triggerRect.top + triggerRect.height / 2 - tooltipRect.height / 2
    top = Math.max(
      viewportPadding,
      Math.min(window.innerHeight - tooltipRect.height - viewportPadding, top),
    )
  }

  return { top, left }
}

class DomTooltipManager {
  private tooltipEl: HTMLDivElement | null = null
  private activeTrigger: HTMLElement | null = null
  private positionOptions: TooltipPositionOptions = {}

  private readonly handleWindowChange = () => {
    this.positionTooltip()
  }

  private readonly handleWindowBlur = () => {
    this.hide()
  }

  private readonly handleVisibilityChange = () => {
    if (document.hidden) {
      this.hide()
    }
  }

  private readonly handleKeyDown = (event: KeyboardEvent) => {
    if (event.key === "Escape") {
      this.hide()
    }
  }

  shouldSkipDelay(): boolean {
    return Date.now() - lastTooltipHiddenAt < SKIP_DELAY_WINDOW_MS
  }

  show(
    trigger: HTMLElement,
    content: string,
    maxWidth: number | string = DEFAULT_TOOLTIP_MAX_WIDTH,
    positionOptions: TooltipPositionOptions = {},
  ): void {
    if (!content || !trigger.isConnected) {
      this.hide(trigger)
      return
    }

    const container = resolveTooltipPortalContainer(trigger)
    if (!container) return

    ensureGlobalTooltipStyles(container)

    if (this.activeTrigger && this.activeTrigger !== trigger) {
      this.activeTrigger.removeAttribute("aria-describedby")
    }

    this.activeTrigger = trigger
    this.positionOptions = positionOptions

    const tooltipEl = this.ensureTooltipElement(container)
    tooltipEl.textContent = content
    tooltipEl.style.maxWidth = typeof maxWidth === "number" ? `${maxWidth}px` : maxWidth
    tooltipEl.style.opacity = "0"

    trigger.setAttribute("aria-describedby", tooltipEl.id)
    this.attachGlobalListeners()
    this.positionTooltip()
  }

  hide(trigger?: HTMLElement): void {
    if (trigger && this.activeTrigger && trigger !== this.activeTrigger) {
      return
    }

    if (this.activeTrigger) {
      this.activeTrigger.removeAttribute("aria-describedby")
      lastTooltipHiddenAt = Date.now()
    }

    this.activeTrigger = null
    this.positionOptions = {}
    this.detachGlobalListeners()

    if (this.tooltipEl?.parentNode) {
      this.tooltipEl.parentNode.removeChild(this.tooltipEl)
    }
  }

  private ensureTooltipElement(container: Element | DocumentFragment): HTMLDivElement {
    if (!this.tooltipEl) {
      this.tooltipEl = document.createElement("div")
      this.tooltipEl.className = "ophel-tooltip"
      this.tooltipEl.id = `ophel-tooltip-${Math.random().toString(36).slice(2, 9)}`
      this.tooltipEl.setAttribute("role", "tooltip")
      this.tooltipEl.style.position = "fixed"
      this.tooltipEl.style.top = "0"
      this.tooltipEl.style.left = "0"
      this.tooltipEl.style.pointerEvents = "none"
      this.tooltipEl.style.zIndex = "2147483647"
    }

    if (this.tooltipEl.parentNode !== container || !this.tooltipEl.isConnected) {
      container.appendChild(this.tooltipEl)
    }

    return this.tooltipEl
  }

  private positionTooltip(): void {
    if (!this.tooltipEl || !this.activeTrigger || !this.tooltipEl.isConnected) {
      return
    }

    const triggerRect = this.activeTrigger.getBoundingClientRect()
    const tooltipRect = this.tooltipEl.getBoundingClientRect()
    const { top, left } = calculateTooltipPosition(triggerRect, tooltipRect, this.positionOptions)

    this.tooltipEl.style.top = `${top}px`
    this.tooltipEl.style.left = `${left}px`
    this.tooltipEl.style.opacity = "1"
  }

  private attachGlobalListeners(): void {
    window.addEventListener("scroll", this.handleWindowChange, true)
    window.addEventListener("resize", this.handleWindowChange)
    window.addEventListener("blur", this.handleWindowBlur)
    window.addEventListener("keydown", this.handleKeyDown)
    document.addEventListener("visibilitychange", this.handleVisibilityChange)
  }

  private detachGlobalListeners(): void {
    window.removeEventListener("scroll", this.handleWindowChange, true)
    window.removeEventListener("resize", this.handleWindowChange)
    window.removeEventListener("blur", this.handleWindowBlur)
    window.removeEventListener("keydown", this.handleKeyDown)
    document.removeEventListener("visibilitychange", this.handleVisibilityChange)
  }
}

const domTooltipManager = new DomTooltipManager()

export function bindDomTooltip(
  trigger: HTMLElement,
  options: DomTooltipOptions,
): DomTooltipBinding {
  let timerId: ReturnType<typeof setTimeout> | null = null

  const clearTimer = () => {
    if (timerId) {
      clearTimeout(timerId)
      timerId = null
    }
  }

  const hide = () => {
    clearTimer()
    domTooltipManager.hide(trigger)
  }

  const show = () => {
    clearTimer()
    if (resolveDisabled(options.disabled)) return

    const effectiveDelay = domTooltipManager.shouldSkipDelay()
      ? 0
      : options.delay ?? DEFAULT_TOOLTIP_DELAY_MS

    timerId = setTimeout(() => {
      if (!trigger.isConnected) return
      const content = options.getContent()
      domTooltipManager.show(
        trigger,
        content,
        options.maxWidth ?? DEFAULT_TOOLTIP_MAX_WIDTH,
        options,
      )
    }, effectiveDelay)
  }

  trigger.addEventListener("mouseenter", show)
  trigger.addEventListener("mouseleave", hide)
  trigger.addEventListener("focus", show)
  trigger.addEventListener("blur", hide)
  trigger.addEventListener("pointerdown", hide)
  trigger.addEventListener("click", hide)

  return {
    hide,
    destroy: () => {
      trigger.removeEventListener("mouseenter", show)
      trigger.removeEventListener("mouseleave", hide)
      trigger.removeEventListener("focus", show)
      trigger.removeEventListener("blur", hide)
      trigger.removeEventListener("pointerdown", hide)
      trigger.removeEventListener("click", hide)
      hide()
    },
  }
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
      lastTooltipHiddenAt = Date.now()
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
    const effectiveDelay = Date.now() - lastTooltipHiddenAt < SKIP_DELAY_WINDOW_MS ? 0 : delay
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
  const showTooltipFromFocus = useCallback(() => {
    if (isFocusFromWindowRestoration()) return
    showTooltip()
  }, [showTooltip])

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
