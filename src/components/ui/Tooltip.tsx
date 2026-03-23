import React, { useCallback, useEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import type { ReactNode } from "react"

const GLOBAL_TOOLTIP_STYLE_ID = "ophel-global-tooltip-styles"
const DEFAULT_TOOLTIP_DELAY_MS = 300
const DEFAULT_TOOLTIP_MAX_WIDTH = 260
const DEFAULT_TOOLTIP_GAP = 8
const DEFAULT_VIEWPORT_PADDING = 10

export const GLOBAL_TOOLTIP_STYLE_TEXT = `
  .ophel-tooltip {
    background-color: rgba(30, 30, 35, 0.95);
    color: #ffffff;
    padding: 6px 12px;
    border-radius: 6px;
    font-size: 13px;
    line-height: 1.5;
    z-index: 2147483647;
    pointer-events: none;
    white-space: pre-wrap;
    word-wrap: break-word;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
    border: 1px solid rgba(255, 255, 255, 0.1);
    backdrop-filter: blur(4px);
    animation: tooltip-fade-in 0.15s ease-out;
  }

  @keyframes tooltip-fade-in {
    from {
      opacity: 0;
      transform: scale(0.95);
    }
    to {
      opacity: 1;
      transform: scale(1);
    }
  }
`

export type TooltipPlacement = "top" | "bottom"

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
  maxWidth?: number | string
  delay?: number
  className?: string
  triggerClassName?: string
  triggerStyle?: React.CSSProperties
  disabled?: boolean
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
    preferredPlacement = "bottom",
    gap = DEFAULT_TOOLTIP_GAP,
    viewportPadding = DEFAULT_VIEWPORT_PADDING,
  } = options

  const preferredTop =
    preferredPlacement === "top"
      ? triggerRect.top - tooltipRect.height - gap
      : triggerRect.bottom + gap
  const fallbackTop =
    preferredPlacement === "top"
      ? triggerRect.bottom + gap
      : triggerRect.top - tooltipRect.height - gap

  let top = preferredTop

  if (top < viewportPadding || top + tooltipRect.height > window.innerHeight - viewportPadding) {
    top = fallbackTop
  }

  if (top < viewportPadding) {
    top = viewportPadding
  }

  if (top + tooltipRect.height > window.innerHeight - viewportPadding) {
    top = Math.max(viewportPadding, window.innerHeight - tooltipRect.height - viewportPadding)
  }

  let left = triggerRect.left + triggerRect.width / 2 - tooltipRect.width / 2

  if (left < viewportPadding) {
    left = viewportPadding
  }

  if (left + tooltipRect.width > window.innerWidth - viewportPadding) {
    left = window.innerWidth - tooltipRect.width - viewportPadding
  }

  return { top, left }
}

class DomTooltipManager {
  private tooltipEl: HTMLDivElement | null = null
  private activeTrigger: HTMLElement | null = null
  private activeContainer: Element | DocumentFragment | null = null
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
    this.activeContainer = container
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
    document.addEventListener("visibilitychange", this.handleVisibilityChange)
  }

  private detachGlobalListeners(): void {
    window.removeEventListener("scroll", this.handleWindowChange, true)
    window.removeEventListener("resize", this.handleWindowChange)
    window.removeEventListener("blur", this.handleWindowBlur)
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

    timerId = setTimeout(() => {
      if (!trigger.isConnected) return
      const content = options.getContent()
      domTooltipManager.show(
        trigger,
        content,
        options.maxWidth ?? DEFAULT_TOOLTIP_MAX_WIDTH,
        options,
      )
    }, options.delay ?? DEFAULT_TOOLTIP_DELAY_MS)
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
  maxWidth = DEFAULT_TOOLTIP_MAX_WIDTH,
  delay = DEFAULT_TOOLTIP_DELAY_MS,
  className = "",
  triggerClassName = "",
  triggerStyle = {},
  disabled = false,
}) => {
  const [isVisible, setIsVisible] = useState(false)
  const [position, setPosition] = useState<TooltipCoordinates>({ top: 0, left: 0 })
  const [isMeasuring, setIsMeasuring] = useState(false)
  const [portalContainer, setPortalContainer] = useState<Element | DocumentFragment | null>(null)

  const triggerRef = useRef<HTMLDivElement>(null)
  const tooltipRef = useRef<HTMLDivElement>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isHoveringRef = useRef(false)

  const hideTooltip = useCallback(() => {
    isHoveringRef.current = false
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
    setIsVisible(false)
    setIsMeasuring(false)
  }, [])

  const showTooltip = useCallback(() => {
    isHoveringRef.current = true
    if (disabled) return
    if (timerRef.current) {
      clearTimeout(timerRef.current)
    }

    timerRef.current = setTimeout(() => {
      setIsVisible(true)
      setIsMeasuring(true)
    }, delay)
  }, [delay, disabled])

  const updatePosition = useCallback(() => {
    const triggerRect = triggerRef.current?.getBoundingClientRect()
    const tooltipRect = tooltipRef.current?.getBoundingClientRect()
    if (!triggerRect || !tooltipRect) return

    setPosition(
      calculateTooltipPosition(triggerRect, tooltipRect, { preferredPlacement: "bottom" }),
    )
  }, [])

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

    const handleVisibilityChange = () => {
      if (document.hidden) {
        hideTooltip()
      }
    }

    window.addEventListener("scroll", handleWindowChange, true)
    window.addEventListener("resize", handleWindowChange)
    window.addEventListener("blur", hideTooltip)
    document.addEventListener("visibilitychange", handleVisibilityChange)

    return () => {
      window.removeEventListener("scroll", handleWindowChange, true)
      window.removeEventListener("resize", handleWindowChange)
      window.removeEventListener("blur", hideTooltip)
      document.removeEventListener("visibilitychange", handleVisibilityChange)
    }
  }, [hideTooltip, isMeasuring, isVisible, updatePosition])

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [])

  useEffect(() => {
    if (disabled) {
      hideTooltip()
    } else if (isHoveringRef.current) {
      if (timerRef.current) {
        clearTimeout(timerRef.current)
      }
      timerRef.current = setTimeout(() => {
        setIsVisible(true)
        setIsMeasuring(true)
      }, delay)
    }
  }, [delay, disabled, hideTooltip])

  return (
    <div
      ref={triggerRef}
      className={`ophel-tooltip-trigger ${className} ${triggerClassName}`}
      onMouseEnter={showTooltip}
      onMouseLeave={hideTooltip}
      onFocus={showTooltip}
      onBlur={hideTooltip}
      style={{ display: "inline-flex", ...triggerStyle }}>
      {children}
      {isVisible &&
        content &&
        portalContainer &&
        createPortal(
          <div
            ref={tooltipRef}
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
