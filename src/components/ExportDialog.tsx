import React, { useEffect, useState } from "react"

import {
  CopyIcon,
  HTMLFileIcon,
  JSONFileIcon,
  MarkdownIcon,
  SegmentedExportIcon,
  TXTFileIcon,
} from "~components/icons"
import type { ConversationExportOptions } from "~core/conversation-manager"
import type { ExportPackaging } from "~types/settings"
import type { ExportFormat } from "~utils/exporter"
import { t } from "~utils/i18n"
import { useSettingsStore } from "~stores/settings-store"

import { DialogOverlay } from "./ui/Dialog"

const EXPORT_DIALOG_STYLES = `
  .gh-export-dialog {
    width: min(440px, calc(100vw - 28px));
    padding: 22px 24px;
    display: flex;
    flex-direction: column;
    gap: 16px;
    box-sizing: border-box;
    background: var(--gh-bg, #ffffff);
    color: var(--gh-text, #1f2937);
    border: 1px solid var(--gh-border, rgba(0, 0, 0, 0.08));
    border-radius: 14px;
    box-shadow: var(--gh-shadow-lg, 0 20px 50px rgba(0, 0, 0, 0.25));
  }

  .gh-export-dialog-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding-bottom: 2px;
  }

  .gh-export-dialog-title-wrap {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .gh-export-dialog-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    border-radius: 7px;
    background: color-mix(in srgb, var(--gh-primary, #4285f4) 14%, transparent);
    color: var(--gh-primary, #4285f4);
  }

  .gh-export-dialog-title {
    font-size: 16px;
    font-weight: 650;
    margin: 0;
    letter-spacing: -0.01em;
    color: var(--gh-text, #1f2937);
  }

  .gh-export-dialog-close {
    background: transparent;
    border: none;
    cursor: pointer;
    color: var(--gh-text-secondary, #6b7280);
    padding: 6px;
    margin: -4px -4px 0 0;
    border-radius: 8px;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: background 0.15s ease, color 0.15s ease;
  }

  .gh-export-dialog-close:hover:not(:disabled) {
    background: var(--gh-hover, rgba(0, 0, 0, 0.05));
    color: var(--gh-text, #1f2937);
  }

  .gh-export-dialog-close:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .gh-export-section {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .gh-export-section-title {
    font-size: 12px;
    font-weight: 600;
    letter-spacing: 0.02em;
    color: var(--gh-text-secondary, #6b7280);
    margin: 0;
  }

  .gh-export-format-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 8px;
  }

  .gh-export-format-btn {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 14px;
    border-radius: 9px;
    border: 1px solid var(--gh-border, #e5e7eb);
    background: var(--gh-bg-secondary, #f9fafb);
    color: var(--gh-text, #1f2937);
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.18s cubic-bezier(0.4, 0, 0.2, 1);
    box-sizing: border-box;
    outline: none;
  }

  .gh-export-format-btn:hover {
    border-color: color-mix(in srgb, var(--gh-primary, #4285f4) 50%, var(--gh-border, #e5e7eb));
    background: var(--gh-hover, #f3f4f6);
    transform: translateY(-1px);
  }

  .gh-export-format-btn:active {
    transform: translateY(0);
  }

  .gh-export-format-btn:focus-visible {
    outline: 2px solid var(--gh-primary, #4285f4);
    outline-offset: 2px;
  }

  .gh-export-format-btn[data-active="true"] {
    border-color: var(--gh-primary, #4285f4);
    background: color-mix(in srgb, var(--gh-primary, #4285f4) 10%, var(--gh-bg, #ffffff));
    color: var(--gh-primary, #4285f4);
    font-weight: 600;
    box-shadow: 0 0 0 1px var(--gh-primary, #4285f4);
  }

  /* 剪贴板是动作而非文件格式，独占整行以容纳各语言长文案 */
  .gh-export-format-btn-full {
    grid-column: 1 / -1;
  }

  .gh-export-format-badge {
    font-size: 11px;
    font-weight: 600;
    padding: 2px 7px;
    border-radius: 5px;
    background: var(--gh-bg-tertiary, #f3f4f6);
    color: var(--gh-text-secondary, #6b7280);
    flex-shrink: 0;
    white-space: nowrap;
    transition: all 0.15s ease;
  }

  .gh-export-format-btn[data-active="true"] .gh-export-format-badge {
    background: color-mix(in srgb, var(--gh-primary, #4285f4) 18%, transparent);
    color: var(--gh-primary, #4285f4);
  }

  .gh-export-format-label {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
    white-space: nowrap;
    overflow: hidden;
  }

  .gh-export-format-label > span {
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .gh-export-format-icon {
    flex-shrink: 0;
    opacity: 0.75;
    transition: opacity 0.15s ease;
  }

  .gh-export-format-btn:hover .gh-export-format-icon,
  .gh-export-format-btn[data-active="true"] .gh-export-format-icon {
    opacity: 1;
  }

  .gh-export-options-list {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 10px 12px;
    border-radius: 10px;
    background: var(--gh-bg-secondary, #f9fafb);
    border: 1px solid var(--gh-border, #e5e7eb);
    box-sizing: border-box;
  }

  .gh-export-option-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 6px 6px;
    border-radius: 6px;
    font-size: 13px;
    color: var(--gh-text, #1f2937);
    cursor: pointer;
    user-select: none;
    transition: background 0.12s ease;
  }

  .gh-export-option-row:hover {
    background: var(--gh-hover, rgba(0, 0, 0, 0.03));
  }

  .gh-export-option-row[data-disabled="true"] {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .gh-export-option-row input[type="checkbox"] {
    accent-color: var(--gh-primary, #4285f4);
    width: 16px;
    height: 16px;
    cursor: pointer;
    margin: 0;
  }

  .gh-export-divider-wrap {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 6px 6px;
    border-radius: 6px;
    font-size: 13px;
    color: var(--gh-text, #1f2937);
  }

  .gh-export-divider-input {
    width: 120px;
    height: 28px;
    padding: 2px 10px;
    border: 1px solid var(--gh-input-border, var(--gh-border, #d1d5db));
    border-radius: 6px;
    font-size: 13px;
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
    text-align: center;
    background: var(--gh-input-bg, var(--gh-bg, #ffffff));
    color: var(--gh-text, #1f2937);
    box-sizing: border-box;
    transition: border-color 0.15s ease, box-shadow 0.15s ease;
  }

  .gh-export-divider-input:focus {
    outline: none;
    border-color: var(--gh-primary, #4285f4);
    box-shadow: 0 0 0 2px color-mix(in srgb, var(--gh-primary, #4285f4) 20%, transparent);
  }

  .gh-export-footer {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 10px;
    margin-top: 4px;
    padding-top: 2px;
  }

  .gh-export-footer-actions {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .gh-export-segmented-link {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 7px 12px;
    font-size: 12px;
    font-weight: 550;
    color: var(--gh-text-secondary, #6b7280);
    background: var(--gh-bg-secondary, #f9fafb);
    border: 1px solid var(--gh-border, #e5e7eb);
    border-radius: 8px;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .gh-export-segmented-link:hover:not(:disabled) {
    color: var(--gh-primary, #4285f4);
    border-color: color-mix(in srgb, var(--gh-primary, #4285f4) 45%, var(--gh-border, #e5e7eb));
    background: color-mix(in srgb, var(--gh-primary, #4285f4) 8%, var(--gh-bg, #ffffff));
  }

  .gh-export-segmented-link:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .gh-export-action-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 8px 18px;
    border-radius: 8px;
    font-size: 13px;
    font-weight: 550;
    cursor: pointer;
    transition: all 0.18s cubic-bezier(0.4, 0, 0.2, 1);
    box-sizing: border-box;
  }

  .gh-export-cancel-btn {
    border: 1px solid var(--gh-border, #d1d5db);
    background: var(--gh-bg-secondary, #ffffff);
    color: var(--gh-text-secondary, #6b7280);
  }

  .gh-export-cancel-btn:hover:not(:disabled) {
    background: var(--gh-hover, #f3f4f6);
    color: var(--gh-text, #1f2937);
    border-color: color-mix(in srgb, var(--gh-text-secondary, #6b7280) 40%, var(--gh-border, #d1d5db));
  }

  .gh-export-cancel-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .gh-export-submit-btn {
    border: 1px solid var(--gh-primary, #4285f4);
    background: var(--gh-primary, #4285f4);
    color: var(--gh-text-on-primary, #ffffff);
    box-shadow: var(--gh-shadow-brand, 0 3px 10px rgba(66, 133, 244, 0.25));
  }

  .gh-export-submit-btn:hover:not(:disabled) {
    filter: brightness(1.06);
    transform: translateY(-1px);
    box-shadow: var(--gh-shadow-brand, 0 5px 14px rgba(66, 133, 244, 0.35));
  }

  .gh-export-submit-btn:active:not(:disabled) {
    transform: translateY(0);
  }

  .gh-export-submit-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
    box-shadow: none;
  }
`

export interface ExportDialogProps {
  isOpen: boolean
  onClose: () => void
  onExport: (format: ExportFormat, options: ConversationExportOptions) => Promise<boolean | void>
  onSegmentedExport?: () => void
}

const getFormatOptions = (): {
  format: ExportFormat
  label: string
  badge: string
  Icon: React.FC<{ size?: number; className?: string }>
}[] => [
  { format: "markdown", label: "Markdown", badge: ".md", Icon: MarkdownIcon },
  { format: "html", label: "HTML", badge: ".html", Icon: HTMLFileIcon },
  { format: "json", label: "JSON", badge: ".json", Icon: JSONFileIcon },
  { format: "txt", label: "Text", badge: ".txt", Icon: TXTFileIcon },
  { format: "clipboard", label: t("exportToClipboard"), badge: "copy", Icon: CopyIcon },
]

export const ExportDialog: React.FC<ExportDialogProps> = ({
  isOpen,
  onClose,
  onExport,
  onSegmentedExport,
}) => {
  const settings = useSettingsStore((state) => state.settings)
  const defaultSettingFormat = settings.export?.defaultExportFormat ?? "markdown"
  const defaultFormat: ExportFormat =
    defaultSettingFormat === "html" ||
    defaultSettingFormat === "json" ||
    defaultSettingFormat === "txt"
      ? defaultSettingFormat
      : "markdown"

  const [selectedFormat, setSelectedFormat] = useState<ExportFormat>(defaultFormat)
  const [includeThoughts, setIncludeThoughts] = useState<boolean>(
    settings.export?.includeThoughts ?? true,
  )
  const [showIndex, setShowIndex] = useState<boolean>(settings.export?.exportShowIndex ?? false)
  const [customDivider, setCustomDivider] = useState<string>(
    settings.export?.exportMarkdownDivider ?? "---",
  )
  const [packageZip, setPackageZip] = useState<boolean>(settings.export?.packaging === "zip")
  const [isExporting, setIsExporting] = useState(false)

  // 每次打开时从全局设置重新同步初始值，避免常驻挂载导致的过期快照
  useEffect(() => {
    if (!isOpen) return
    const current = useSettingsStore.getState().settings
    const formatSetting = current.export?.defaultExportFormat ?? "markdown"
    setSelectedFormat(
      formatSetting === "html" || formatSetting === "json" || formatSetting === "txt"
        ? formatSetting
        : "markdown",
    )
    setIncludeThoughts(current.export?.includeThoughts ?? true)
    setShowIndex(current.export?.exportShowIndex ?? false)
    setCustomDivider(current.export?.exportMarkdownDivider ?? "---")
    setPackageZip(current.export?.packaging === "zip")
  }, [isOpen])

  if (!isOpen) return null

  const isMarkdownLike = selectedFormat === "markdown" || selectedFormat === "clipboard"

  const handleConfirm = async () => {
    setIsExporting(true)
    try {
      const packaging: ExportPackaging =
        selectedFormat === "markdown" && packageZip ? "zip" : "markdown"
      const success = await onExport(selectedFormat, {
        includeThoughts,
        showIndex,
        packaging,
        customDivider,
      })
      if (success !== false) {
        onClose()
      }
    } finally {
      setIsExporting(false)
    }
  }

  return (
    <DialogOverlay
      onClose={onClose}
      dialogClassName="gh-export-dialog"
      closeOnOverlayClick={!isExporting}
      closeOnEscape={!isExporting}>
      <style>{EXPORT_DIALOG_STYLES}</style>
      <div className="gh-export-dialog-header">
        <div className="gh-export-dialog-title-wrap">
          <div className="gh-export-dialog-icon">
            <svg
              viewBox="0 0 24 24"
              width="16"
              height="16"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
          </div>
          <h3 className="gh-export-dialog-title">{t("exportConversationTitle")}</h3>
        </div>
        <button
          type="button"
          className="gh-export-dialog-close"
          onClick={onClose}
          disabled={isExporting}
          aria-label={t("close")}>
          <svg
            viewBox="0 0 24 24"
            width="18"
            height="18"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>

      <div className="gh-export-section">
        <div className="gh-export-section-title">{t("exportFormat")}</div>
        <div className="gh-export-format-grid">
          {getFormatOptions().map((item) => (
            <button
              key={item.format}
              type="button"
              className={
                item.format === "clipboard"
                  ? "gh-export-format-btn gh-export-format-btn-full"
                  : "gh-export-format-btn"
              }
              data-active={selectedFormat === item.format}
              onClick={() => setSelectedFormat(item.format)}>
              <span className="gh-export-format-label">
                <item.Icon size={15} className="gh-export-format-icon" />
                <span>{item.label}</span>
              </span>
              <span className="gh-export-format-badge">{item.badge}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="gh-export-section">
        <div className="gh-export-section-title">{t("exportOptions")}</div>
        <div className="gh-export-options-list">
          <label className="gh-export-option-row">
            <span>{t("exportIncludeThoughtsLabel")}</span>
            <input
              type="checkbox"
              checked={includeThoughts}
              onChange={(e) => setIncludeThoughts(e.target.checked)}
            />
          </label>

          <label
            className="gh-export-option-row"
            data-disabled={selectedFormat === "json"}
            title={selectedFormat === "json" ? t("exportShowIndexJsonUnsupported") : undefined}>
            <span>{t("exportShowIndexLabel")}</span>
            <input
              type="checkbox"
              checked={showIndex}
              disabled={selectedFormat === "json"}
              onChange={(e) => setShowIndex(e.target.checked)}
            />
          </label>

          {isMarkdownLike && (
            <div className="gh-export-divider-wrap">
              <span>{t("exportMarkdownDividerLabel")}</span>
              <input
                type="text"
                className="gh-export-divider-input"
                value={customDivider}
                onChange={(e) => setCustomDivider(e.target.value)}
                placeholder="---"
              />
            </div>
          )}

          {selectedFormat === "markdown" && (
            <label className="gh-export-option-row">
              <span>{t("exportPackagingZipOption")}</span>
              <input
                type="checkbox"
                checked={packageZip}
                onChange={(e) => setPackageZip(e.target.checked)}
              />
            </label>
          )}
        </div>
      </div>

      <div className="gh-export-footer">
        {onSegmentedExport ? (
          <button
            type="button"
            className="gh-export-segmented-link"
            disabled={isExporting}
            onClick={() => {
              onClose()
              onSegmentedExport()
            }}>
            <SegmentedExportIcon size={14} />
            {t("segmentedExportMenuItem")}
          </button>
        ) : (
          <span />
        )}
        <div className="gh-export-footer-actions">
          <button
            type="button"
            className="gh-export-action-btn gh-export-cancel-btn"
            disabled={isExporting}
            onClick={onClose}>
            {t("cancel")}
          </button>
          <button
            type="button"
            className="gh-export-action-btn gh-export-submit-btn"
            disabled={isExporting}
            onClick={handleConfirm}>
            {isExporting
              ? t("exporting")
              : selectedFormat === "clipboard"
                ? t("copy")
                : t("export")}
          </button>
        </div>
      </div>
    </DialogOverlay>
  )
}
