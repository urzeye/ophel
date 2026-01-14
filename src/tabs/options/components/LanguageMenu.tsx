import React, { useEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"

export const LANG_MAP: Record<string, string> = {
  "zh-CN": "简体中文",
  "zh-TW": "繁體中文",
  en: "English",
  es: "Español",
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
  themeMode = "light",
  onSelect,
  onClose,
  triggerRef,
}) => {
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

  const colors =
    themeMode === "dark"
      ? {
          bg: "#1f2937",
          border: "#374151",
          text: "#e5e7eb",
          hover: "#374151",
          activeBg: "rgba(59, 130, 246, 0.2)",
        }
      : {
          bg: "#ffffff",
          border: "#e5e7eb",
          text: "#374151",
          hover: "#f3f4f6",
          activeBg: "rgba(59, 130, 246, 0.1)",
        }

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
          background: colors.bg,
          border: `1px solid ${colors.border}`,
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
              background: currentLang === key ? colors.activeBg : "transparent",
              color: currentLang === key ? "#3b82f6" : colors.text,
              fontSize: "13px",
              cursor: "pointer",
              borderRadius: "4px",
              textAlign: "left",
              width: "100%",
              fontWeight: currentLang === key ? 500 : 400,
              transition: "background-color 0.1s",
            }}
            onMouseEnter={(e) => {
              if (currentLang !== key) e.currentTarget.style.backgroundColor = colors.hover
            }}
            onMouseLeave={(e) => {
              if (currentLang !== key)
                e.currentTarget.style.backgroundColor =
                  currentLang === key ? colors.activeBg : "transparent"
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
    document.body,
  )
}
