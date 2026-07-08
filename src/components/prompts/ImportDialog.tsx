import React from "react"
import { createPortal } from "react-dom"

import { Button } from "~components/ui"
import { OPHEL_HOVER_WIDTH_RETAIN_LAYER_PROPS } from "~utils/dom-toolkit"
import { t } from "~utils/i18n"

interface ImportDialogProps {
  isOpen: boolean
  promptCount: number
  onClose: () => void
  onMerge: () => void
  onOverwrite: () => void
}

export const ImportDialog = ({
  isOpen,
  promptCount,
  onClose,
  onMerge,
  onOverwrite,
}: ImportDialogProps) => {
  if (!isOpen) return null

  return createPortal(
    <div
      className="import-dialog gh-interactive"
      {...OPHEL_HOVER_WIDTH_RETAIN_LAYER_PROPS}
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose()
        }
      }}
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: "var(--gh-overlay-bg, rgba(0, 0, 0, 0.5))",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 10001,
      }}>
      <div
        style={{
          width: "90%",
          maxWidth: "400px",
          background: "var(--gh-bg, white)",
          borderRadius: "12px",
          boxShadow: "var(--gh-shadow-lg)",
          padding: "24px",
        }}>
        <div
          style={{
            fontSize: "16px",
            fontWeight: 600,
            marginBottom: "12px",
            color: "var(--gh-text)",
          }}>
          {t("promptImportTitle")}
        </div>
        <div
          style={{
            fontSize: "14px",
            color: "var(--gh-text-secondary)",
            marginBottom: "20px",
            lineHeight: 1.6,
          }}>
          {t("promptImportMessage2").replace("{count}", promptCount.toString())}
          <ul style={{ margin: "8px 0 0 0", paddingLeft: "20px" }}>
            <li>{t("promptImportOverwriteDesc")}</li>
            <li>{t("promptImportMergeDesc")}</li>
          </ul>
        </div>
        <div style={{ display: "flex", gap: "12px", justifyContent: "flex-end" }}>
          <Button
            variant="ghost"
            onClick={onClose}
            style={{ background: "var(--gh-hover, #f3f4f6)" }}>
            {t("cancel")}
          </Button>
          <Button
            variant="ghost"
            onClick={onMerge}
            style={{
              background: "var(--gh-primary-light, #e3f2fd)",
              color: "var(--gh-primary, #4285f4)",
            }}>
            {t("promptMerge")}
          </Button>
          <Button variant="primary" onClick={onOverwrite}>
            {t("promptOverwrite")}
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
