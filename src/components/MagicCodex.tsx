import React, { useEffect, useRef } from "react"

import { t } from "~utils/i18n"

interface Props {
  isOpen: boolean
  onClose: () => void
  tips: { icon: string; text: React.ReactNode; shortcut?: string }[]
  isStatic?: boolean
  onMouseEnter?: React.MouseEventHandler<HTMLDivElement>
  onMouseLeave?: React.MouseEventHandler<HTMLDivElement>
}

export const MagicCodex: React.FC<Props> = ({
  isOpen,
  onClose,
  tips,
  isStatic = false,
  onMouseEnter,
  onMouseLeave,
}) => {
  const popoverRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!isOpen || isStatic) return

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation()
        onClose()
      }
    }

    document.addEventListener("keydown", handleKeyDown)
    return () => {
      document.removeEventListener("keydown", handleKeyDown)
    }
  }, [isOpen, isStatic, onClose])

  useEffect(() => {
    if (!isOpen || isStatic) return

    const handleOutsideClick = (e: MouseEvent) => {
      const target = typeof e.composedPath === "function" ? e.composedPath()[0] : e.target
      if (popoverRef.current && !popoverRef.current.contains(target as Node)) {
        onClose()
      }
    }

    const timeoutId = window.setTimeout(() => {
      document.addEventListener("click", handleOutsideClick)
    }, 10)

    return () => {
      window.clearTimeout(timeoutId)
      document.removeEventListener("click", handleOutsideClick)
    }
  }, [isOpen, isStatic, onClose])

  if (!isOpen) return null

  return (
    <div
      ref={popoverRef}
      role="dialog"
      aria-label={t("featureTipsCategory")}
      className={`gh-magic-codex-popover ${isStatic ? "static" : "floating"}`}
      onPointerDown={(e) => e.stopPropagation()}
      onPointerUp={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      style={{
        position: isStatic ? "relative" : "absolute",
        top: isStatic ? "auto" : "36px",
        left: isStatic ? "auto" : "-4px",
        width: isStatic ? "100%" : "max-content",
        margin: isStatic ? "0 auto" : "0",
        maxWidth: isStatic ? "100%" : "calc(var(--panel-width, 320px) - 24px)",
        textAlign: "left",
        backgroundColor: isStatic ? "var(--gh-bg-secondary, #f9fafb)" : "var(--gh-bg, #ffffff)",
        border: "1px solid var(--gh-border, #e5e7eb)",
        borderRadius: "16px",
        boxShadow: isStatic
          ? "inset 0 1px 0 rgba(255,255,255,0.1)"
          : "var(--gh-shadow-lg, 0 12px 32px -4px rgba(0,0,0,0.15))",
        zIndex: 10000,
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        animation: "gh-popover-enter 0.3s cubic-bezier(0.2, 0.8, 0.2, 1)",
      }}>
      <div
        className="gh-hide-scrollbar"
        style={{
          padding: "10px",
          display: "flex",
          flexDirection: "column",
          gap: "2px",
          maxHeight: "420px",
          overflowY: "auto",
          userSelect: "none",
        }}>
        {tips.map((tip, idx) => (
          <div
            key={idx}
            className="gh-interactive"
            style={{
              display: "flex",
              alignItems: "flex-start",
              gap: "12px",
              padding: "7px 12px",
              borderRadius: "10px",
              fontSize: "13px",
              color: "var(--gh-text-secondary, #4b5563)",
              lineHeight: "1.5",
              backgroundColor: isStatic ? "transparent" : "var(--gh-bg, transparent)",
              transition: "background-color 0.2s ease, transform 0.1s ease",
            }}>
            <div
              style={{
                fontSize: "18px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                width: "28px",
                height: "28px",
                flexShrink: 0,
                borderRadius: "8px",
                backgroundColor: "var(--gh-bg-tertiary, rgba(0,0,0,0.04))",
                boxShadow: "inset 0 1px 0 rgba(255,255,255,0.2)",
              }}>
              {tip.icon}
            </div>
            <div
              style={{
                flex: 1,
                display: "flex",
                flexDirection: "column",
                alignSelf: "center",
                gap: "2px",
              }}>
              <span
                style={{
                  whiteSpace: "normal",
                  wordBreak: "break-word",
                  color: "var(--gh-text, #374151)",
                }}>
                {tip.text}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
