import React, { useEffect, useRef, useState } from "react"

import { t } from "~utils/i18n"

const CODEX_COLLAPSED_STORAGE_KEY = "ophel:magic_codex_collapsed"

interface Props {
  isOpen: boolean
  onClose: () => void
  tips: { icon: string; text: React.ReactNode; shortcut?: string }[]
  isStatic?: boolean
  collapsible?: boolean
  onMouseEnter?: React.MouseEventHandler<HTMLDivElement>
  onMouseLeave?: React.MouseEventHandler<HTMLDivElement>
}

export const MagicCodex: React.FC<Props> = ({
  isOpen,
  onClose,
  tips,
  isStatic = false,
  collapsible = false,
  onMouseEnter,
  onMouseLeave,
}) => {
  const popoverRef = useRef<HTMLDivElement>(null)

  const [isCollapsed, setIsCollapsed] = useState(() => {
    if (!isStatic || !collapsible) return false
    try {
      if (typeof window !== "undefined") {
        return window.localStorage.getItem(CODEX_COLLAPSED_STORAGE_KEY) === "true"
      }
    } catch {
      // fallback to expanded
    }
    return false
  })

  const handleToggleCollapse = (e: React.MouseEvent) => {
    e.stopPropagation()
    setIsCollapsed((prev) => {
      const next = !prev
      try {
        if (typeof window !== "undefined") {
          window.localStorage.setItem(CODEX_COLLAPSED_STORAGE_KEY, String(next))
        }
      } catch {
        // ignore
      }
      return next
    })
  }

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

  if (isStatic && collapsible && isCollapsed) {
    return (
      <div
        ref={popoverRef}
        role="region"
        aria-label={t("magicCodexTitle")}
        className="gh-magic-codex-collapsed-wrap"
        onClick={(e) => e.stopPropagation()}
        onDoubleClick={(e) => e.stopPropagation()}>
        <button
          type="button"
          className="gh-magic-codex-pill gh-interactive"
          onClick={handleToggleCollapse}
          aria-label={t("magicCodexExpand")}
          title={t("magicCodexExpand")}>
          <span className="gh-magic-codex-pill-icon" aria-hidden="true">
            💡
          </span>
          <span className="gh-magic-codex-pill-title">{t("magicCodexTitle")}</span>
          <span className="gh-magic-codex-pill-count">{tips.length}</span>
          <span className="gh-magic-codex-pill-arrow" aria-hidden="true">
            ›
          </span>
        </button>
      </div>
    )
  }

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
      {isStatic && collapsible && (
        <div className="gh-magic-codex-header">
          <div className="gh-magic-codex-header-title">
            <span className="gh-magic-codex-header-icon" aria-hidden="true">
              💡
            </span>
            <span>{t("magicCodexTitle")}</span>
            <span className="gh-magic-codex-header-count">{tips.length}</span>
          </div>
          <button
            type="button"
            className="gh-magic-codex-collapse-btn gh-interactive"
            onClick={handleToggleCollapse}
            aria-label={t("magicCodexCollapse")}
            title={t("magicCodexCollapse")}>
            <span>{t("magicCodexCollapse")}</span>
            <span className="gh-magic-codex-collapse-arrow" aria-hidden="true">
              ▴
            </span>
          </button>
        </div>
      )}
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
