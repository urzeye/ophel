import React, { useEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import type { ReactNode } from "react"

export interface TooltipProps {
  content: string | ReactNode
  children: ReactNode
  maxWidth?: number | string
  // Optional delay in ms
  delay?: number
  className?: string
  triggerClassName?: string
  triggerStyle?: React.CSSProperties
  disabled?: boolean
}

export const Tooltip: React.FC<TooltipProps> = ({
  content,
  children,
  maxWidth = 260,
  delay = 300,
  className = "",
  triggerClassName = "",
  triggerStyle = {},
  disabled = false,
}) => {
  const [isVisible, setIsVisible] = useState(false)
  const [position, setPosition] = useState({ top: 0, left: 0 })
  const [isMeasuring, setIsMeasuring] = useState(false)
  const [portalContainer, setPortalContainer] = useState<Element | DocumentFragment | null>(null)

  const triggerRef = useRef<HTMLDivElement>(null)
  const tooltipRef = useRef<HTMLDivElement>(null)
  const timerRef = useRef<NodeJS.Timeout>()
  const isHoveringRef = useRef(false)

  const handleMouseEnter = () => {
    isHoveringRef.current = true
    if (disabled) return
    timerRef.current = setTimeout(() => {
      setIsVisible(true)
      setIsMeasuring(true) // Start measuring to adjust position
    }, delay)
  }

  const handleMouseLeave = () => {
    isHoveringRef.current = false
    if (timerRef.current) {
      clearTimeout(timerRef.current)
    }
    setIsVisible(false)
    setIsMeasuring(false)
  }

  // Determine the correct portal container (ShadowRoot or Body)
  useEffect(() => {
    if (triggerRef.current) {
      const root = triggerRef.current.getRootNode()
      if (root instanceof ShadowRoot) {
        setPortalContainer(root)
      } else {
        setPortalContainer(document.body)
      }
    }
  }, [])

  // Calculate position when visible or measuring
  useEffect(() => {
    if ((isVisible || isMeasuring) && triggerRef.current) {
      const updatePosition = () => {
        const triggerRect = triggerRef.current?.getBoundingClientRect()
        if (!triggerRect) return

        let top = triggerRect.bottom + 8 // Default: below
        let left = triggerRect.left + triggerRect.width / 2

        // If we have ref to tooltip, adjust for boundaries
        if (tooltipRef.current) {
          const tooltipRect = tooltipRef.current.getBoundingClientRect()

          // Check bottom edge
          if (top + tooltipRect.height > window.innerHeight - 10) {
            // Flip to top
            top = triggerRect.top - tooltipRect.height - 8
          }

          // Center horizontally
          left = left - tooltipRect.width / 2

          // Check left edge
          if (left < 10) left = 10

          // Check right edge
          if (left + tooltipRect.width > window.innerWidth - 10) {
            left = window.innerWidth - tooltipRect.width - 10
          }
        }

        setPosition({ top, left })
        if (isMeasuring) setIsMeasuring(false)
      }

      updatePosition()
      // Initial measure might be off if content not rendered yet, so we use isMeasuring state
      // to trigger a re-render/re-calc
    }
  }, [isVisible, isMeasuring, content])

  // Cleanup
  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [])

  // React to disabled prop change
  useEffect(() => {
    if (disabled) {
      if (timerRef.current) clearTimeout(timerRef.current)
      setIsVisible(false)
      setIsMeasuring(false)
    } else if (isHoveringRef.current) {
      // Re-trigger show if enabled while still hovering
      timerRef.current = setTimeout(() => {
        setIsVisible(true)
        setIsMeasuring(true)
      }, delay)
    }
  }, [disabled, delay])

  return (
    <div
      ref={triggerRef}
      className={`ophel-tooltip-trigger ${className} ${triggerClassName}`}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
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
              opacity: isMeasuring ? 0 : 1, // Hide while measuring
            }}>
            {content}
          </div>,
          portalContainer,
        )}
    </div>
  )
}
