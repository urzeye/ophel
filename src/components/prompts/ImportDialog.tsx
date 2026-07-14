import React from "react"

import { Button, DialogOverlay } from "~components/ui"
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

  return (
    <DialogOverlay
      onClose={onClose}
      overlayClassName="import-dialog"
      ariaLabel={t("promptImportTitle")}
      dialogStyle={{ width: "90%", maxWidth: "400px", padding: "24px" }}>
      <div className="gh-dialog-title">{t("promptImportTitle")}</div>
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
    </DialogOverlay>
  )
}
