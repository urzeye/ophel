import React from "react"

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

  return (
    <div className="gh-loading-mask">
      <div className="gh-loading-content">
        <div className="gh-loading-spinner">⏳</div>
        <div className="gh-loading-text">{text || t("loadingHistory")}</div>
        <div className="gh-loading-hint">{t("loadingHint")}</div>
        {onStop && (
          <button className="gh-loading-stop-btn" onClick={onStop}>
            {t("stopLoading")}
          </button>
        )}
      </div>
    </div>
  )
}
