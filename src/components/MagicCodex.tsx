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
      role={isStatic ? "region" : "dialog"}
      aria-label={t("featureTipsCategory")}
      className={`gh-magic-codex-popover ${isStatic ? "static" : "floating"}`}
      onPointerDown={(e) => e.stopPropagation()}
      onPointerUp={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}>
      <div className="gh-magic-codex-list gh-hide-scrollbar">
        {tips.map((tip, idx) => (
          <div key={idx} className="gh-magic-codex-item gh-interactive">
            <div className="gh-magic-codex-icon">{tip.icon}</div>
            <div className="gh-magic-codex-body">
              <span className="gh-magic-codex-text">{tip.text}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
