import React, { useEffect, useRef } from "react"

import { t } from "~utils/i18n"

interface Props {
  isOpen: boolean
  onClose: () => void
  tips: { icon: string; text: React.ReactNode; shortcut?: string }[]
  isStatic?: boolean
}

export const MagicCodex: React.FC<Props> = ({ isOpen, onClose, tips, isStatic = false }) => {
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
      className="gh-magic-codex-popover"
      onPointerDown={(e) => e.stopPropagation()}
      onPointerUp={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
      style={{
        position: isStatic ? "relative" : "absolute",
        top: isStatic ? "auto" : "36px",
        left: isStatic ? "auto" : "-4px",
        width: isStatic ? "100%" : "max-content",
        maxWidth: isStatic ? "100%" : "calc(var(--panel-width, 320px) - 24px)",
        textAlign: "left",
        backgroundColor: "var(--gh-bg, #ffffff)",
        border: "1px solid var(--gh-border, #e5e7eb)",
        borderRadius: "12px",
        boxShadow: "var(--gh-shadow-lg, 0 10px 40px rgba(0,0,0,0.15))",
        zIndex: 10000,
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        animation: "gh-popover-enter 0.2s cubic-bezier(0.2, 0.8, 0.2, 1)",
      }}>
      <div
        className="gh-hide-scrollbar"
        style={{
          padding: "8px",
          display: "flex",
          flexDirection: "column",
          gap: "2px",
          maxHeight: "300px",
          overflowY: "auto",
        }}>
        {tips.map((tip, idx) => (
          <div
            key={idx}
            className="gh-interactive"
            style={{
              display: "flex",
              alignItems: "center",
              gap: "10px",
              padding: "8px 10px",
              borderRadius: "8px",
              fontSize: "13px",
              color: "var(--gh-text-secondary, #4b5563)",
              lineHeight: "1.5",
            }}>
            <span style={{ fontSize: "16px" }}>{tip.icon}</span>
            <div style={{ flex: 1, display: "block", alignSelf: "center", lineHeight: "1.6" }}>
              <span style={{ whiteSpace: "normal", wordBreak: "break-word" }}>{tip.text}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
