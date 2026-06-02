import React, { useEffect } from "react"
import { createPortal } from "react-dom"

import { t } from "~utils/i18n"

interface LoadingOverlayProps {
  isVisible: boolean
  text?: string
  hint?: string
  tone?: "default" | "export"
  blockPageInteraction?: boolean
  onStop?: () => void
}

/**
 * 全屏加载遮罩组件
 * 用于显示历史加载等长时间操作的进度
 */
export const LoadingOverlay: React.FC<LoadingOverlayProps> = ({
  isVisible,
  text,
  hint,
  tone = "default",
  blockPageInteraction = false,
  onStop,
}) => {
  useEffect(() => {
    if (!isVisible || !blockPageInteraction) return

    const blockEvent = (event: Event) => {
      if (!event.isTrusted) return
      event.preventDefault()
      event.stopPropagation()
      event.stopImmediatePropagation()
    }
    const blockedEventTypes = [
      "keydown",
      "keyup",
      "keypress",
      "beforeinput",
      "input",
      "wheel",
      "pointerdown",
      "pointerup",
      "mousedown",
      "mouseup",
      "click",
      "dblclick",
      "contextmenu",
      "touchstart",
      "touchmove",
      "touchend",
      "dragstart",
      "drop",
    ]
    const listenerOptions: AddEventListenerOptions = { capture: true, passive: false }

    blockedEventTypes.forEach((eventType) => {
      window.addEventListener(eventType, blockEvent, listenerOptions)
    })

    return () => {
      blockedEventTypes.forEach((eventType) => {
        window.removeEventListener(eventType, blockEvent, listenerOptions)
      })
    }
  }, [blockPageInteraction, isVisible])

  if (!isVisible) return null

  const isExportTone = tone === "export"

  const maskStyle: React.CSSProperties = {
    position: "fixed",
    top: 0,
    left: 0,
    width: "100vw",
    height: "100vh",
    background: isExportTone ? "rgba(15, 23, 42, 0.34)" : "rgba(0, 0, 0, 0.5)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 2147483646,
    pointerEvents: "auto",
    backdropFilter: isExportTone ? "blur(2px)" : undefined,
    WebkitBackdropFilter: isExportTone ? "blur(2px)" : undefined,
  }
  const contentStyle: React.CSSProperties = {
    background: isExportTone
      ? "color-mix(in srgb, var(--gh-bg, #ffffff) 94%, transparent)"
      : "var(--gh-bg, #fff)",
    padding: isExportTone ? "20px 24px" : "24px 32px",
    borderRadius: isExportTone ? "10px" : "12px",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: isExportTone ? "10px" : "12px",
    boxShadow: isExportTone
      ? "0 18px 48px rgba(15, 23, 42, 0.22), 0 0 0 1px color-mix(in srgb, var(--gh-primary, #4285f4) 18%, var(--gh-border, #d1d5db))"
      : "0 4px 20px rgba(0, 0, 0, 0.15)",
    minWidth: isExportTone ? "260px" : "200px",
    maxWidth: "min(360px, calc(100vw - 40px))",
    border: isExportTone
      ? "1px solid color-mix(in srgb, var(--gh-primary, #4285f4) 16%, var(--gh-border, #e5e7eb))"
      : undefined,
  }
  const spinnerStyle: React.CSSProperties = isExportTone
    ? {
        width: "28px",
        height: "28px",
        border: "3px solid color-mix(in srgb, var(--gh-primary, #4285f4) 18%, transparent)",
        borderTopColor: "var(--gh-primary, #4285f4)",
        borderRadius: "999px",
        animation: "gh-loading-spin 0.8s linear infinite",
      }
    : {
        fontSize: "32px",
      }
  const textStyle: React.CSSProperties = {
    color: "var(--gh-text, #333)",
    fontSize: "14px",
    fontWeight: isExportTone ? 650 : 500,
    textAlign: "center",
  }
  const hintStyle: React.CSSProperties = {
    color: "var(--gh-text-secondary, #9ca3af)",
    fontSize: "12px",
    textAlign: "center",
    lineHeight: 1.5,
  }
  const stopButtonStyle: React.CSSProperties = {
    marginTop: "8px",
    padding: "8px 20px",
    background: "var(--gh-primary, #4285f4)",
    color: "white",
    border: "none",
    borderRadius: "6px",
    fontSize: "13px",
    cursor: "pointer",
  }

  const overlay = (
    <div
      className={`gh-loading-mask ${isExportTone ? "gh-loading-mask--export" : ""}`}
      style={maskStyle}
      role="status"
      aria-live="polite"
      aria-busy="true">
      {isExportTone && (
        <style>
          {`
          @keyframes gh-loading-spin {
            to { transform: rotate(360deg); }
          }
        `}
        </style>
      )}
      <div className="gh-loading-content" style={contentStyle}>
        <div className="gh-loading-spinner" style={spinnerStyle} aria-hidden="true">
          {isExportTone ? null : "⏳"}
        </div>
        <div className="gh-loading-text" style={textStyle}>
          {text || t("loadingHistory")}
        </div>
        <div className="gh-loading-hint" style={hintStyle}>
          {hint || t("loadingHint")}
        </div>
        {onStop && (
          <button className="gh-loading-stop-btn" style={stopButtonStyle} onClick={onStop}>
            {t("stopLoading")}
          </button>
        )}
      </div>
    </div>
  )

  if (!document?.body) {
    return overlay
  }

  return createPortal(overlay, document.body)
}
