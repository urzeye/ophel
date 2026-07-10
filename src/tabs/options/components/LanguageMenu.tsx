import React, { useEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"

import { useOverlayPortalTarget } from "~components/ui/OverlayPortal"

export const LANG_MAP: Record<string, string> = {
  "zh-CN": "简体中文",
  "zh-TW": "繁體中文",
  en: "English",
  es: "Español",
  it: "Italiano",
  pt: "Português",
  ru: "Русский",
  ja: "日本語",
  de: "Deutsch",
  fr: "Français",
  ko: "한국어",
}

interface LanguageMenuProps {
  currentLang: string
  themeMode: "light" | "dark"
  onSelect: (lang: string) => void
  onClose: () => void
  triggerRef: React.RefObject<HTMLButtonElement>
}

export const LanguageMenu: React.FC<LanguageMenuProps> = ({
  currentLang,
  onSelect,
  onClose,
  triggerRef,
}) => {
  const portalTarget = useOverlayPortalTarget()
  const menuRef = useRef<HTMLDivElement>(null)
  const [position, setPosition] = useState({ top: 0, left: 0 })

  // Calculate position on mount
  useEffect(() => {
    if (!triggerRef.current) return
    const rect = triggerRef.current.getBoundingClientRect()
    // Position: Bottom-Right aligned with trigger, appearing ABOVE it
    // Note: Since we are in Portal (Light DOM), coordinates are relative to viewport, which matches rect.
    setPosition({
      top: rect.top - 10, // Slight offset
      left: rect.right, // Align to right edge
    })
  }, [triggerRef])

  if (!portalTarget) return null

  // Use createPortal to render outside of any overflow:hidden containers
  return createPortal(
    <div className="lang-menu-portal" style={{ position: "relative", zIndex: 2147483647 }}>
      {/* Backdrop */}
      <div
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          width: "100vw",
          height: "100vh",
          zIndex: 2000000,
          background: "transparent",
        }}
        onClick={(e) => {
          e.stopPropagation()
          onClose()
        }}
      />

      {/* Menu Content */}
      <div
        ref={menuRef}
        style={{
          position: "fixed",
          // Position relative to viewport
          bottom: window.innerHeight - position.top + 5,
          left: position.left - 150, // Shift left by width
          width: "150px",
          background: "var(--gh-bg, #ffffff)",
          border: "1px solid var(--gh-border, #e5e7eb)",
          borderRadius: "8px",
          boxShadow: "0 4px 20px rgba(0, 0, 0, 0.15)",
          padding: "4px",
          zIndex: 2000001,
          animation: "ophel-lang-pop 0.1s ease-out",
          display: "flex",
          flexDirection: "column",
          maxHeight: "500px",
          overflowY: "auto",
        }}>
        {Object.entries(LANG_MAP).map(([key, label]) => (
          <button
            key={key}
            onClick={(e) => {
              e.stopPropagation()
              onSelect(key)
            }}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "8px 12px",
              border: "none",
              background:
                currentLang === key
                  ? "color-mix(in srgb, var(--gh-primary, #4285f4) 12%, transparent)"
                  : "transparent",
              color: currentLang === key ? "var(--gh-primary, #4285f4)" : "var(--gh-text, #374151)",
              fontSize: "13px",
              cursor: "pointer",
              borderRadius: "4px",
              textAlign: "left",
              width: "100%",
              fontWeight: currentLang === key ? 500 : 400,
              transition: "background-color 0.1s",
            }}
            onMouseEnter={(e) => {
              if (currentLang !== key) {
                e.currentTarget.style.backgroundColor = "var(--gh-hover, #f3f4f6)"
              }
            }}
            onMouseLeave={(e) => {
              if (currentLang !== key) e.currentTarget.style.backgroundColor = "transparent"
            }}>
            <span>{label}</span>
            {currentLang === key && <span>✓</span>}
          </button>
        ))}
      </div>
      <style>{`
        @keyframes ophel-lang-pop {
          from { opacity: 0; transform: scale(0.95); }
          to { opacity: 1; transform: scale(1); }
        }
      `}</style>
    </div>,
    portalTarget,
  )
}
