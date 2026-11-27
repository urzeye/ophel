import React, { useCallback, useEffect, useId, useState } from "react"

import {
  CopyIcon,
  CopyOutlineIcon,
  DownloadIcon,
  HTMLFileIcon,
  ImageFileIcon,
  JSONFileIcon,
  MarkdownIcon,
  SegmentedExportIcon,
  SettingsIcon,
  TXTFileIcon,
} from "~components/icons"
import type { ConversationExportOptions } from "~core/conversation-manager"
import { useSettingsStore } from "~stores/settings-store"
import type { ExportPackaging, ExportStyle } from "~types/settings"
import type { ExportFormat } from "~utils/exporter"
import { t } from "~utils/i18n"

import { DialogOverlay } from "./ui/Dialog"
import { Switch } from "./ui/Switch"
import { Tooltip } from "./ui/Tooltip"

const EXPORT_DIALOG_STYLES = `
  .gh-dialog.gh-export-dialog {
    width: min(492px, calc(100vw - 28px));
    max-width: 492px;
    max-height: calc(100dvh - 28px);
    overflow-y: auto;
    overscroll-behavior: contain;
    padding: 20px 22px;
    display: flex;
    flex-direction: column;
    gap: 16px;
    box-sizing: border-box;
    background: var(--gh-bg, #ffffff);
    color: var(--gh-text, #1f2937);
    font-family: var(--gh-font-family, "Inter", system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", "Microsoft YaHei", "PingFang SC", "Hiragino Sans SC", "Apple SD Gothic Neo", "Malgun Gothic", sans-serif);
    border: 1px solid var(--gh-border, rgba(0, 0, 0, 0.08));
    border-radius: 16px;
    box-shadow: var(--gh-shadow-lg, 0 20px 50px rgba(0, 0, 0, 0.25));
    animation: gh-export-dialog-in 200ms cubic-bezier(0.16, 1, 0.3, 1) both;
  }

  @keyframes gh-export-dialog-in {
    from {
      opacity: 0;
      transform: translateY(6px) scale(0.99);
    }
    to {
      opacity: 1;
      transform: none;
    }
  }

  .gh-export-dialog-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  }

  .gh-export-dialog-title-wrap {
    display: flex;
    align-items: center;
    gap: 9px;
    min-width: 0;
  }

  .gh-export-dialog-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    flex-shrink: 0;
    border-radius: 8px;
    background: color-mix(in srgb, var(--gh-primary, #4285f4) 12%, transparent);
    color: var(--gh-primary-text, var(--gh-primary, #4285f4));
  }

  .gh-export-dialog-title {
    font-size: 15.5px;
    font-weight: 650;
    margin: 0;
    letter-spacing: -0.01em;
    color: var(--gh-text, #1f2937);
    line-height: 1.35;
  }

  .gh-export-dialog-close {
    width: 32px;
    height: 32px;
    flex-shrink: 0;
    background: transparent;
    border: none;
    cursor: pointer;
    color: var(--gh-text-secondary, #6b7280);
    padding: 0;
    margin: -4px -4px -4px 0;
    border-radius: 8px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    transition: background 0.15s ease, color 0.15s ease, transform 0.12s ease;
  }

  .gh-export-dialog-close:hover:not(:disabled) {
    background: var(--gh-hover, rgba(0, 0, 0, 0.05));
    color: var(--gh-text, #1f2937);
  }

  .gh-export-dialog-close:active:not(:disabled) {
    transform: translateY(1px);
  }

  .gh-export-dialog-close:focus-visible {
    outline: 2px solid var(--gh-primary, #4285f4);
    outline-offset: 2px;
  }

  .gh-export-dialog-close:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  /* 导出的不是当前页面的对话时，用标题说明导出对象；过长省略，完整标题在悬浮提示里 */
  .gh-export-dialog-target {
    padding: 8px 12px;
    border-radius: 8px;
    border: 1px solid var(--gh-border, #e5e7eb);
    background: var(--gh-bg-secondary, #f9fafb);
    color: var(--gh-text, #1f2937);
    font-size: 13px;
    font-weight: 500;
    box-sizing: border-box;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .gh-export-section {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .gh-export-section-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }

  .gh-export-section-title {
    font-size: 12px;
    font-weight: 600;
    letter-spacing: 0.01em;
    color: var(--gh-text-secondary, #6b7280);
    margin: 0;
  }

  .gh-export-settings-btn {
    background: transparent;
    border: none;
    cursor: pointer;
    color: var(--gh-text-secondary, #6b7280);
    width: 32px;
    height: 32px;
    padding: 0;
    margin: -6px -6px -6px 0;
    border-radius: 6px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    transition: background 0.15s ease, color 0.15s ease, transform 0.12s ease;
    outline: none;
  }

  .gh-export-settings-btn:hover:not(:disabled) {
    background: var(--gh-hover, rgba(0, 0, 0, 0.05));
    color: var(--gh-text, #1f2937);
  }

  .gh-export-settings-btn:active:not(:disabled) {
    transform: translateY(1px);
  }

  .gh-export-settings-btn:focus-visible {
    outline: 2px solid var(--gh-primary, #4285f4);
    outline-offset: 2px;
  }

  .gh-export-settings-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .gh-export-format-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 8px;
  }

  .gh-export-format-btn {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    min-width: 0;
    min-height: 42px;
    padding: 9px 12px;
    border-radius: 8px;
    border: 1px solid var(--gh-border, #e5e7eb);
    background: color-mix(in srgb, var(--gh-text, #1f2937) 3%, var(--gh-bg, #ffffff));
    color: var(--gh-text, #1f2937);
    font: inherit;
    font-size: 13px;
    font-weight: 500;
    line-height: 1.3;
    cursor: pointer;
    transition: background 0.15s ease, border-color 0.15s ease, color 0.15s ease, box-shadow 0.15s ease, transform 0.12s ease;
    box-sizing: border-box;
    outline: none;
  }

  .gh-export-format-btn:hover:not(:disabled):not([data-active="true"]) {
    border-color: color-mix(in srgb, var(--gh-text-secondary, #6b7280) 35%, var(--gh-border, #e5e7eb));
    background: var(--gh-hover, #f3f4f6);
  }

  .gh-export-format-btn:active:not(:disabled) {
    transform: translateY(1px);
  }

  .gh-export-format-btn:focus-visible {
    outline: 2px solid var(--gh-primary, #4285f4);
    outline-offset: 2px;
  }

  /* 选中：主色描边 + 柔和淡底 + 高对比主色字，兼顾 24 套深浅预置 WCAG AA 对比度 */
  .gh-export-format-btn[data-active="true"] {
    border-color: var(--gh-primary, #4285f4);
    background: color-mix(in srgb, var(--gh-primary, #4285f4) 7%, var(--gh-bg, #ffffff));
    color: color-mix(in srgb, var(--gh-primary-text, var(--gh-primary, #4285f4)) 76%, var(--gh-text, #1f2937));
    box-shadow: 0 0 0 1px color-mix(in srgb, var(--gh-primary, #4285f4) 22%, transparent);
  }

  .gh-export-format-badge {
    font-size: 12px;
    font-weight: 600;
    line-height: 1.25;
    letter-spacing: 0.01em;
    font-variant-numeric: tabular-nums;
    padding: 2px 6px;
    border-radius: 6px;
    background: var(--gh-bg-tertiary, var(--gh-hover, #f3f4f6));
    color: var(--gh-text-secondary, #6b7280);
    flex-shrink: 0;
    white-space: nowrap;
    transition: background 0.15s ease, color 0.15s ease;
  }

  .gh-export-format-btn[data-active="true"] .gh-export-format-badge {
    background: color-mix(in srgb, var(--gh-primary, #4285f4) 11%, var(--gh-bg, #ffffff));
    color: color-mix(in srgb, var(--gh-primary-text, var(--gh-primary, #4285f4)) 72%, var(--gh-text, #1f2937));
  }

  .gh-export-format-label {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
    flex: 1 1 auto;
    white-space: nowrap;
    overflow: hidden;
  }

  .gh-export-format-text {
    display: block;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .gh-export-format-icon {
    flex-shrink: 0;
    opacity: 0.78;
    transition: opacity 0.15s ease;
  }

  .gh-export-format-btn:hover .gh-export-format-icon,
  .gh-export-format-btn[data-active="true"] .gh-export-format-icon {
    opacity: 1;
  }

  .gh-export-options-list {
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: 6px;
    border-radius: 10px;
    background: var(--gh-bg-secondary, #f9fafb);
    border: 1px solid var(--gh-border, #e5e7eb);
    box-sizing: border-box;
  }

  /* 选中“复制大纲”时选项整体置灰：它不使用这些选项；不隐藏，避免切换时布局跳动 */
  .gh-export-options-list[data-disabled="true"] {
    opacity: 0.5;
  }

  .gh-export-options-list[data-disabled="true"] .gh-export-option-row {
    cursor: not-allowed;
  }

  .gh-export-option-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    min-height: 34px;
    padding: 6px 8px;
    border-radius: 6px;
    font-size: 13px;
    line-height: 1.4;
    color: var(--gh-text, #1f2937);
    cursor: pointer;
    user-select: none;
    transition: background 0.12s ease;
    box-sizing: border-box;
  }

  .gh-export-option-row > span:first-child {
    min-width: 0;
    overflow-wrap: break-word;
  }

  .gh-export-option-row:hover:not([data-disabled="true"]) {
    background: var(--gh-hover, rgba(0, 0, 0, 0.04));
  }

  .gh-export-option-row[data-disabled="true"] {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .gh-export-options-note {
    margin: 0;
    font-size: 12px;
    line-height: 1.45;
    color: var(--gh-text-secondary, #6b7280);
  }

  .gh-export-divider-wrap {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    min-height: 36px;
    padding: 5px 8px;
    border-radius: 6px;
    font-size: 13px;
    line-height: 1.4;
    color: var(--gh-text, #1f2937);
  }

  .gh-export-divider-label {
    min-width: 0;
    overflow-wrap: break-word;
  }

  .gh-export-divider-input {
    width: 82px;
    height: 28px;
    flex-shrink: 0;
    padding: 2px 10px;
    border: 1px solid var(--gh-input-border, var(--gh-border, #d1d5db));
    border-radius: 6px;
    font-size: 13px;
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
    text-align: center;
    background: var(--gh-input-bg, var(--gh-bg, #ffffff));
    color: var(--gh-text, #1f2937);
    caret-color: var(--gh-primary, #4285f4);
    box-sizing: border-box;
    transition: border-color 0.15s ease, box-shadow 0.15s ease;
  }

  .gh-export-divider-input:focus {
    outline: 2px solid transparent;
    border-color: var(--gh-primary, #4285f4);
    box-shadow: 0 0 0 2px color-mix(in srgb, var(--gh-primary, #4285f4) 20%, transparent);
  }

  .gh-export-footer {
    display: flex;
    justify-content: space-between;
    align-items: center;
    flex-wrap: wrap;
    gap: 10px 12px;
    margin-top: 2px;
    padding-top: 14px;
    border-top: 1px solid var(--gh-border, #e5e7eb);
  }

  .gh-export-footer-actions {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    flex-wrap: wrap;
    gap: 8px;
    margin-left: auto;
  }

  .gh-export-footer-actions .gh-dialog-btn {
    min-height: 36px;
    padding: 7px 16px;
    border-radius: 8px;
    font: inherit;
    font-size: 13px;
    font-weight: 550;
    line-height: 1.25;
    flex-shrink: 0;
    word-break: normal;
    overflow-wrap: normal;
    box-sizing: border-box;
  }

  .gh-export-footer-actions .gh-dialog-btn-primary {
    box-shadow: var(--gh-shadow-brand, 0 2px 8px rgba(66, 133, 244, 0.25));
  }

  .gh-export-footer-actions .gh-dialog-btn-primary:disabled {
    box-shadow: none;
  }

  /* 分段导出的唯一入口：主色淡底 + 主色描边 + 主色字，比“取消”醒目，又不和实心的“导出”抢 */
  .gh-export-segmented-link {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    min-height: 36px;
    padding: 7px 12px;
    font: inherit;
    font-size: 13px;
    font-weight: 550;
    line-height: 1.25;
    white-space: nowrap;
    flex-shrink: 0;
    word-break: normal;
    overflow-wrap: normal;
    color: color-mix(in srgb, var(--gh-primary-text, var(--gh-primary, #4285f4)) 76%, var(--gh-text, #1f2937));
    background: color-mix(in srgb, var(--gh-primary, #4285f4) 6%, var(--gh-bg, #ffffff));
    border: 1px solid color-mix(in srgb, var(--gh-primary, #4285f4) 32%, var(--gh-border, #e5e7eb));
    border-radius: 8px;
    cursor: pointer;
    box-sizing: border-box;
    transition: background 0.15s ease, border-color 0.15s ease, transform 0.12s ease;
  }

  .gh-export-segmented-link:hover:not(:disabled) {
    border-color: color-mix(in srgb, var(--gh-primary, #4285f4) 55%, var(--gh-border, #e5e7eb));
    background: color-mix(in srgb, var(--gh-primary, #4285f4) 14%, var(--gh-bg, #ffffff));
  }

  .gh-export-segmented-link:active:not(:disabled) {
    transform: translateY(1px);
  }

  .gh-export-segmented-link:focus-visible {
    outline: 2px solid var(--gh-primary, #4285f4);
    outline-offset: 2px;
  }

  .gh-export-segmented-link:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  @media (max-width: 440px) {
    .gh-dialog.gh-export-dialog {
      padding: 16px;
    }

    .gh-export-format-grid {
      grid-template-columns: 1fr;
    }
  }

  @media (pointer: coarse) {
    .gh-export-dialog-close,
    .gh-export-settings-btn {
      width: 44px;
      height: 44px;
    }

    .gh-export-format-btn,
    .gh-export-segmented-link,
    .gh-export-footer-actions .gh-dialog-btn {
      min-height: 44px;
    }

    .gh-export-option-row {
      min-height: 44px;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .gh-dialog.gh-export-dialog {
      animation: none;
    }

    .gh-export-dialog-close,
    .gh-export-settings-btn,
    .gh-export-format-btn,
    .gh-export-format-badge,
    .gh-export-format-icon,
    .gh-export-option-row,
    .gh-export-divider-input,
    .gh-export-segmented-link {
      transition: none;
    }
  }
`

const EXPORT_DIALOG_STYLE_ID = "gh-export-dialog-styles"
let exportDialogStylesInjected = false

function ensureExportDialogStyles(): void {
  if (exportDialogStylesInjected && document.getElementById(EXPORT_DIALOG_STYLE_ID)) return
  const existing = document.getElementById(EXPORT_DIALOG_STYLE_ID)
  if (existing) {
    exportDialogStylesInjected = true
    return
  }
  const style = document.createElement("style")
  style.id = EXPORT_DIALOG_STYLE_ID
  style.textContent = EXPORT_DIALOG_STYLES
  document.head.appendChild(style)
  exportDialogStylesInjected = true
}

export interface ExportDialogProps {
  isOpen: boolean
  onClose: () => void
  onExport: (format: ExportFormat, options: ConversationExportOptions) => Promise<boolean | void>
  /**
   * 导出目标是另一段对话或独立文档。传入后显示目标标题，并隐藏依赖默认对话
   * 的入口（分段导出、复制大纲），避免它们作用到其他内容。
   */
  target?: { title: string }
  onSegmentedExport?: () => void
  onOpenSettings?: () => void
}

const getFormatOptions = (
  imageBadge: ".png" | ".jpg",
): {
  format: ExportFormat
  label: string
  badge?: string
  Icon: React.FC<{ size?: number; className?: string }>
}[] => [
  { format: "markdown", label: "Markdown", badge: ".md", Icon: MarkdownIcon },
  { format: "html", label: "HTML", badge: ".html", Icon: HTMLFileIcon },
  { format: "image", label: t("exportToImage"), badge: imageBadge, Icon: ImageFileIcon },
  { format: "json", label: "JSON", badge: ".json", Icon: JSONFileIcon },
  { format: "txt", label: t("exportToTXT"), badge: ".txt", Icon: TXTFileIcon },
  { format: "clipboard", label: t("exportToClipboard"), Icon: CopyIcon },
]

export const ExportDialog: React.FC<ExportDialogProps> = ({
  isOpen,
  onClose,
  onExport,
  target,
  onSegmentedExport,
  onOpenSettings,
}) => {
  const settings = useSettingsStore((state) => state.settings)
  const dividerInputId = useId()
  const optionsNoteId = useId()
  const defaultSettingFormat = settings.export?.defaultExportFormat ?? "markdown"
  const defaultFormat: ExportFormat =
    defaultSettingFormat === "html" ||
    defaultSettingFormat === "json" ||
    defaultSettingFormat === "txt" ||
    defaultSettingFormat === "image"
      ? defaultSettingFormat
      : "markdown"

  const handleOpenExportSettings = useCallback(() => {
    onClose()
    if (onOpenSettings) {
      onOpenSettings()
      return
    }
    window.dispatchEvent(
      new CustomEvent("ophel:navigateSettingsPage", {
        detail: { settingId: "export-settings-card" },
      }),
    )
  }, [onClose, onOpenSettings])

  const [selectedFormat, setSelectedFormat] = useState<ExportFormat>(defaultFormat)
  // “复制大纲”不是导出格式：单独记录选中状态，selectedFormat 保持不变，选项区因此不会因切换而跳变
  const [outlineCopySelected, setOutlineCopySelected] = useState(false)
  const [includeThoughts, setIncludeThoughts] = useState<boolean>(
    settings.export?.includeThoughts ?? true,
  )
  const [showIndex, setShowIndex] = useState<boolean>(settings.export?.exportShowIndex ?? false)
  const [customDivider, setCustomDivider] = useState<string>(
    settings.export?.exportMarkdownDivider ?? "---",
  )
  const [packageZip, setPackageZip] = useState<boolean>(settings.export?.packaging === "zip")
  const [exportStyle, setExportStyle] = useState<ExportStyle>(
    settings.export?.exportStyle === "clean" ? "clean" : "standard",
  )
  const [isExporting, setIsExporting] = useState(false)

  // 每次打开时确保样式已单次注入并从全局设置同步初始值，避免常驻挂载导致的过期快照
  useEffect(() => {
    if (!isOpen) return
    ensureExportDialogStyles()
    const current = useSettingsStore.getState().settings
    const formatSetting = current.export?.defaultExportFormat ?? "markdown"
    setSelectedFormat(
      formatSetting === "html" ||
        formatSetting === "json" ||
        formatSetting === "txt" ||
        formatSetting === "image"
        ? formatSetting
        : "markdown",
    )
    setIncludeThoughts(current.export?.includeThoughts ?? true)
    setShowIndex(current.export?.exportShowIndex ?? false)
    setCustomDivider(current.export?.exportMarkdownDivider ?? "---")
    setPackageZip(current.export?.packaging === "zip")
    setExportStyle(current.export?.exportStyle === "clean" ? "clean" : "standard")
    setOutlineCopySelected(false)
  }, [isOpen])

  if (!isOpen) return null

  const isMarkdownLike = selectedFormat === "markdown" || selectedFormat === "clipboard"
  const imageBadge: ".png" | ".jpg" = settings.export?.image?.format === "jpeg" ? ".jpg" : ".png"
  const optionsInlineNote = outlineCopySelected
    ? t("exportOptionsOutlineCopyHint")
    : selectedFormat === "json"
      ? t("exportShowIndexJsonUnsupported")
      : ""

  const handleConfirm = async () => {
    // 复制大纲由大纲 tab 暴露的能力完成，不走导出流程，也不使用下面的导出选项
    if (outlineCopySelected) {
      onClose()
      void window.__ophelCopyFullOutline?.()
      return
    }

    setIsExporting(true)
    try {
      const packaging: ExportPackaging =
        selectedFormat === "markdown" && packageZip ? "zip" : "markdown"
      const success = await onExport(selectedFormat, {
        includeThoughts,
        showIndex,
        packaging,
        customDivider,
        style: exportStyle,
      })
      if (success !== false) {
        onClose()
      }
    } finally {
      setIsExporting(false)
    }
  }

  const handleDialogKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "Enter" || event.nativeEvent.isComposing || isExporting) return
    const active = event.target as HTMLElement | null
    // 聚焦在普通按钮或链接上时交由浏览器执行该按钮自身动作；在输入框或弹窗容器上回车直接确认导出。
    if (active?.closest("button, a, textarea")) return
    event.preventDefault()
    void handleConfirm()
  }

  return (
    <DialogOverlay
      onClose={onClose}
      dialogClassName="gh-export-dialog"
      ariaLabel={t("exportConversationTitle")}
      onDialogKeyDown={handleDialogKeyDown}
      closeOnOverlayClick={!isExporting}
      closeOnEscape={!isExporting}>
      <div className="gh-export-dialog-header">
        <div className="gh-export-dialog-title-wrap">
          <div className="gh-export-dialog-icon" aria-hidden="true">
            <DownloadIcon size={16} />
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
            strokeLinejoin="round"
            aria-hidden="true">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>

      {target && (
        <Tooltip
          content={target.title}
          showOnlyWhenTruncated
          triggerStyle={{ display: "block", minWidth: 0 }}>
          <div className="gh-export-dialog-target">{target.title}</div>
        </Tooltip>
      )}

      <div className="gh-export-section">
        <div className="gh-export-section-title">{t("exportFormat")}</div>
        <div className="gh-export-format-grid">
          {getFormatOptions(imageBadge).map((item) => (
            <button
              key={item.format}
              type="button"
              className="gh-export-format-btn"
              aria-pressed={!outlineCopySelected && selectedFormat === item.format}
              data-active={!outlineCopySelected && selectedFormat === item.format}
              onClick={() => {
                setSelectedFormat(item.format)
                setOutlineCopySelected(false)
              }}>
              <span className="gh-export-format-label">
                <item.Icon size={15} className="gh-export-format-icon" />
                <Tooltip
                  content={item.label}
                  showOnlyWhenTruncated
                  triggerStyle={{ display: "block", minWidth: 0, overflow: "hidden" }}>
                  <span className="gh-export-format-text">{item.label}</span>
                </Tooltip>
              </span>
              {item.badge && <span className="gh-export-format-badge">{item.badge}</span>}
            </button>
          ))}
          {/* 复制大纲：与“复制 Markdown”一样先选中、再点底部“复制”；能力由大纲 tab 挂载期间暴露，未挂载时不显示；只针对当前页面的对话，导出其他对话时隐藏 */}
          {!target && typeof window.__ophelCopyFullOutline === "function" && (
            <button
              type="button"
              className="gh-export-format-btn"
              aria-pressed={outlineCopySelected}
              data-active={outlineCopySelected}
              onClick={() => setOutlineCopySelected(true)}>
              <span className="gh-export-format-label">
                <CopyOutlineIcon size={15} className="gh-export-format-icon" />
                <Tooltip
                  content={t("outlineCopyFull")}
                  showOnlyWhenTruncated
                  triggerStyle={{ display: "block", minWidth: 0, overflow: "hidden" }}>
                  <span className="gh-export-format-text">{t("outlineCopyFull")}</span>
                </Tooltip>
              </span>
            </button>
          )}
        </div>
      </div>

      <div className="gh-export-section">
        <div className="gh-export-section-header">
          <div className="gh-export-section-title">{t("exportOptions")}</div>
          <Tooltip content={t("exportSettings")}>
            <button
              type="button"
              className="gh-export-settings-btn"
              aria-label={t("exportSettings")}
              disabled={isExporting}
              onClick={handleOpenExportSettings}>
              <SettingsIcon size={14} />
            </button>
          </Tooltip>
        </div>
        <Tooltip
          content={t("exportOptionsOutlineCopyHint")}
          disabled={!outlineCopySelected}
          triggerStyle={{ display: "block" }}>
          <div
            className="gh-export-options-list"
            data-disabled={outlineCopySelected}
            aria-disabled={outlineCopySelected}
            aria-describedby={optionsInlineNote ? optionsNoteId : undefined}>
            <label className="gh-export-option-row">
              <span>{t("exportIncludeThoughtsLabel")}</span>
              <Switch
                size="sm"
                renderAs="span"
                checked={includeThoughts}
                disabled={outlineCopySelected}
                onChange={setIncludeThoughts}
              />
            </label>

            <Tooltip
              content={t("exportShowIndexJsonUnsupported")}
              disabled={outlineCopySelected || selectedFormat !== "json"}
              triggerStyle={{ display: "block" }}>
              <label
                className="gh-export-option-row"
                data-disabled={!outlineCopySelected && selectedFormat === "json"}>
                <span>{t("exportShowIndexLabel")}</span>
                <Switch
                  size="sm"
                  renderAs="span"
                  checked={showIndex}
                  disabled={outlineCopySelected || selectedFormat === "json"}
                  onChange={setShowIndex}
                />
              </label>
            </Tooltip>

            {isMarkdownLike && (
              <div className="gh-export-divider-wrap">
                <label htmlFor={dividerInputId} className="gh-export-divider-label">
                  {t("exportMarkdownDividerLabel")}
                </label>
                <input
                  id={dividerInputId}
                  type="text"
                  className="gh-export-divider-input"
                  value={customDivider}
                  disabled={outlineCopySelected}
                  onChange={(e) => setCustomDivider(e.target.value)}
                  placeholder="---"
                />
              </div>
            )}

            {selectedFormat === "markdown" && (
              <label className="gh-export-option-row">
                <span>{t("exportPackagingZipOption")}</span>
                <Switch
                  size="sm"
                  renderAs="span"
                  checked={packageZip}
                  disabled={outlineCopySelected}
                  onChange={setPackageZip}
                />
              </label>
            )}

            {isMarkdownLike && (
              <label className="gh-export-option-row">
                <span>{t("exportStyleCleanOption")}</span>
                <Switch
                  size="sm"
                  renderAs="span"
                  checked={exportStyle === "clean"}
                  disabled={outlineCopySelected}
                  onChange={(checked) => setExportStyle(checked ? "clean" : "standard")}
                />
              </label>
            )}
          </div>
        </Tooltip>
        {optionsInlineNote && (
          <p id={optionsNoteId} className="gh-export-options-note">
            {optionsInlineNote}
          </p>
        )}
      </div>

      <div className="gh-export-footer">
        {onSegmentedExport && !target ? (
          <button
            type="button"
            className="gh-export-segmented-link"
            disabled={isExporting}
            onClick={() => {
              onClose()
              onSegmentedExport()
            }}>
            <SegmentedExportIcon size={14} />
            <span>{t("segmentedExportMenuItem")}</span>
          </button>
        ) : (
          <span />
        )}
        <div className="gh-export-footer-actions">
          <button
            type="button"
            className="gh-dialog-btn gh-dialog-btn-secondary"
            disabled={isExporting}
            onClick={onClose}>
            {t("cancel")}
          </button>
          <button
            type="button"
            className="gh-dialog-btn gh-dialog-btn-primary"
            disabled={isExporting}
            onClick={handleConfirm}>
            {isExporting
              ? t("exporting")
              : outlineCopySelected || selectedFormat === "clipboard"
                ? t("copy")
                : selectedFormat === "image"
                  ? t("imageExportPreview")
                  : t("export")}
          </button>
        </div>
      </div>
    </DialogOverlay>
  )
}
