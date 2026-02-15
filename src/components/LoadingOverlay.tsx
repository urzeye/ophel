import React from "react"
import { createPortal } from "react-dom"

import { t } from "~utils/i18n"

interface LoadingOverlayProps {
  isVisible: boolean
  text?: string
  onStop?: () => void
}

/**
 * 全屏加载遮罩组件
 * 用于显示历史加载等长时间操作的进度
 */
export const LoadingOverlay: React.FC<LoadingOverlayProps> = ({ isVisible, text, onStop }) => {
  if (!isVisible) return null

  const maskStyle: React.CSSProperties = {
    position: "fixed",
    top: 0,
    left: 0,
    width: "100vw",
    height: "100vh",
    background: "rgba(0, 0, 0, 0.5)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 2147483646,
    pointerEvents: "auto",
  }
  const contentStyle: React.CSSProperties = {
    background: "var(--gh-bg, #fff)",
    padding: "24px 32px",
    borderRadius: "12px",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: "12px",
    boxShadow: "0 4px 20px rgba(0, 0, 0, 0.15)",
    minWidth: "200px",
  }
  const spinnerStyle: React.CSSProperties = {
    fontSize: "32px",
  }
  const textStyle: React.CSSProperties = {
    color: "var(--gh-text, #333)",
    fontSize: "14px",
    fontWeight: 500,
  }
  const hintStyle: React.CSSProperties = {
    color: "var(--gh-text-secondary, #9ca3af)",
    fontSize: "12px",
    textAlign: "center",
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
    <div className="gh-loading-mask" style={maskStyle}>
      <div className="gh-loading-content" style={contentStyle}>
        <div className="gh-loading-spinner" style={spinnerStyle}>
          ⏳
        </div>
        <div className="gh-loading-text" style={textStyle}>
          {text || t("loadingHistory")}
        </div>
        <div className="gh-loading-hint" style={hintStyle}>
          {t("loadingHint")}
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
