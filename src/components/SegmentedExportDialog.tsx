import React, { useEffect, useMemo, useState } from "react"

import type {
  ConversationExportSegment,
  ConversationSegmentedExportDraft,
  ConversationSegmentedExportMode,
} from "~core/conversation-manager"
import { t } from "~utils/i18n"

import { DialogOverlay } from "./ui/Dialog"

const SEGMENTED_EXPORT_DIALOG_STYLES = `
  .segmented-export-dialog {
    width: min(760px, calc(100vw - 28px));
    max-width: 760px;
    height: min(680px, calc(100vh - 36px));
    padding: 0;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    border-radius: 10px;
  }
  .segmented-export-header {
    padding: 16px 18px 12px;
    border-bottom: 1px solid var(--gh-border, #e5e7eb);
  }
  .segmented-export-title-row,
  .segmented-export-toolbar,
  .segmented-export-footer {
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .segmented-export-title-row {
    justify-content: space-between;
    min-width: 0;
  }
  .segmented-export-title {
    font-size: 16px;
    font-weight: 650;
    color: var(--gh-text, #1f2937);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .segmented-export-count {
    flex: 0 0 auto;
    font-size: 12px;
    color: var(--gh-text-secondary, #6b7280);
  }
  .segmented-export-toolbar {
    margin-top: 12px;
    flex-wrap: wrap;
  }
  .segmented-export-input,
  .segmented-export-select {
    height: 34px;
    border: 1px solid var(--gh-input-border, #d1d5db);
    border-radius: 7px;
    background: var(--gh-input-bg, #ffffff);
    color: var(--gh-text, #1f2937);
    font-size: 13px;
    box-sizing: border-box;
  }
  .segmented-export-input {
    padding: 0 10px;
  }
  .segmented-export-search {
    flex: 1 1 220px;
    min-width: 160px;
  }
  .segmented-export-range {
    flex: 0 1 150px;
    min-width: 120px;
  }
  .segmented-export-select {
    flex: 0 0 180px;
    padding: 0 8px;
  }
  .segmented-export-input:focus,
  .segmented-export-select:focus {
    outline: none;
    border-color: var(--gh-primary, #4285f4);
    box-shadow: 0 0 0 2px color-mix(in srgb, var(--gh-primary, #4285f4) 18%, transparent);
  }
  .segmented-export-button {
    height: 34px;
    padding: 0 10px;
    border: 1px solid var(--gh-border, #d1d5db);
    border-radius: 7px;
    background: var(--gh-bg, #ffffff);
    color: var(--gh-text, #374151);
    font-size: 12px;
    cursor: pointer;
    white-space: nowrap;
  }
  .segmented-export-button:hover:not(:disabled) {
    background: var(--gh-hover, #f3f4f6);
  }
  .segmented-export-button:disabled {
    opacity: 0.55;
    cursor: not-allowed;
  }
  .segmented-export-list {
    flex: 1 1 auto;
    overflow: auto;
    padding: 8px;
    background: color-mix(in srgb, var(--gh-bg, #ffffff) 92%, var(--gh-hover, #f3f4f6));
  }
  .segmented-export-row {
    width: 100%;
    display: grid;
    grid-template-columns: 28px 42px minmax(0, 1fr);
    gap: 8px;
    padding: 10px;
    border: 1px solid transparent;
    border-radius: 8px;
    background: var(--gh-bg, #ffffff);
    color: var(--gh-text, #1f2937);
    text-align: left;
    cursor: pointer;
  }
  .segmented-export-row + .segmented-export-row {
    margin-top: 6px;
  }
  .segmented-export-row:hover {
    border-color: var(--gh-border, #e5e7eb);
  }
  .segmented-export-row.is-selected {
    border-color: color-mix(in srgb, var(--gh-primary, #4285f4) 45%, var(--gh-border, #e5e7eb));
    background: color-mix(in srgb, var(--gh-primary, #4285f4) 8%, var(--gh-bg, #ffffff));
  }
  .segmented-export-checkbox {
    width: 16px;
    height: 16px;
    margin: 2px 0 0;
    accent-color: var(--gh-primary, #4285f4);
  }
  .segmented-export-index {
    font-variant-numeric: tabular-nums;
    color: var(--gh-text-secondary, #6b7280);
    font-size: 12px;
    line-height: 18px;
  }
  .segmented-export-segment-main {
    min-width: 0;
  }
  .segmented-export-segment-title {
    font-size: 13px;
    font-weight: 600;
    line-height: 1.35;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .segmented-export-meta,
  .segmented-export-preview {
    display: block;
    font-size: 12px;
    color: var(--gh-text-secondary, #6b7280);
    line-height: 1.45;
  }
  .segmented-export-meta {
    margin-top: 3px;
  }
  .segmented-export-preview {
    margin-top: 6px;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }
  .segmented-export-empty {
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--gh-text-secondary, #6b7280);
    font-size: 13px;
  }
  .segmented-export-footer {
    justify-content: space-between;
    flex-wrap: wrap;
    padding: 12px 18px 16px;
    border-top: 1px solid var(--gh-border, #e5e7eb);
  }
  .segmented-export-footer-actions {
    display: flex;
    flex: 1 1 280px;
    flex-wrap: wrap;
    justify-content: flex-end;
    gap: 8px;
  }
  .segmented-export-primary {
    border-color: transparent;
    background: var(--gh-primary, #4285f4);
    color: white;
  }
  .segmented-export-primary:hover:not(:disabled) {
    background: color-mix(in srgb, var(--gh-primary, #4285f4) 86%, black);
  }
`

let segmentedExportDialogStylesInjected = false

function ensureSegmentedExportDialogStyles(): void {
  if (segmentedExportDialogStylesInjected) return
  const style = document.createElement("style")
  style.id = "gh-segmented-export-dialog-styles"
  style.textContent = SEGMENTED_EXPORT_DIALOG_STYLES
  document.head.appendChild(style)
  segmentedExportDialogStylesInjected = true
}

interface SegmentedExportDialogProps {
  draft: ConversationSegmentedExportDraft
  isExporting?: boolean
  onCancel: () => void
  onExport: (segmentIds: string[], mode: ConversationSegmentedExportMode) => Promise<void> | void
}

function parseSegmentRange(value: string, segments: ConversationExportSegment[]): Set<string> {
  const selected = new Set<string>()
  const byIndex = new Map(segments.map((segment) => [segment.index, segment.id]))

  value
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean)
    .forEach((part) => {
      const rangeMatch = /^(\d+)\s*-\s*(\d+)$/.exec(part)
      if (rangeMatch) {
        const start = Number(rangeMatch[1])
        const end = Number(rangeMatch[2])
        const min = Math.min(start, end)
        const max = Math.max(start, end)
        for (let index = min; index <= max; index += 1) {
          const id = byIndex.get(index)
          if (id) selected.add(id)
        }
        return
      }

      const index = Number(part)
      const id = Number.isFinite(index) ? byIndex.get(index) : undefined
      if (id) selected.add(id)
    })

  return selected
}

export const SegmentedExportDialog: React.FC<SegmentedExportDialogProps> = ({
  draft,
  isExporting = false,
  onCancel,
  onExport,
}) => {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(
    () => new Set(draft.segments.map((segment) => segment.id)),
  )
  const [searchQuery, setSearchQuery] = useState("")
  const [rangeInput, setRangeInput] = useState("")
  const [mode, setMode] = useState<ConversationSegmentedExportMode>("zip-markdown")

  useEffect(() => {
    ensureSegmentedExportDialogStyles()
  }, [])

  const filteredSegments = useMemo(() => {
    const query = searchQuery.trim().toLowerCase()
    if (!query) return draft.segments
    return draft.segments.filter((segment) => {
      return (
        segment.title.toLowerCase().includes(query) || segment.preview.toLowerCase().includes(query)
      )
    })
  }, [draft.segments, searchQuery])

  const selectedCount = selectedIds.size

  const setVisibleSelection = (selected: boolean) => {
    setSelectedIds((current) => {
      const next = new Set(current)
      filteredSegments.forEach((segment) => {
        if (selected) next.add(segment.id)
        else next.delete(segment.id)
      })
      return next
    })
  }

  const invertVisibleSelection = () => {
    setSelectedIds((current) => {
      const next = new Set(current)
      filteredSegments.forEach((segment) => {
        if (next.has(segment.id)) next.delete(segment.id)
        else next.add(segment.id)
      })
      return next
    })
  }

  const applyRangeSelection = () => {
    const next = parseSegmentRange(rangeInput, draft.segments)
    setSelectedIds(next)
  }

  const toggleSegment = (segmentId: string) => {
    setSelectedIds((current) => {
      const next = new Set(current)
      if (next.has(segmentId)) next.delete(segmentId)
      else next.add(segmentId)
      return next
    })
  }

  return (
    <DialogOverlay
      onClose={onCancel}
      closeOnOverlayClick={!isExporting}
      closeOnEscape={!isExporting}
      dialogClassName="segmented-export-dialog"
      dialogStyle={{ maxWidth: "760px" }}>
      <div className="segmented-export-header">
        <div className="segmented-export-title-row">
          <div className="segmented-export-title">{t("segmentedExportTitle")}</div>
          <div className="segmented-export-count">
            {t("segmentedExportDetected").replace("{count}", String(draft.segments.length))}
          </div>
        </div>
        <div className="segmented-export-toolbar">
          <input
            className="segmented-export-input segmented-export-search"
            value={searchQuery}
            placeholder={t("segmentedExportSearchPlaceholder")}
            onChange={(event) => setSearchQuery(event.target.value)}
          />
          <input
            className="segmented-export-input segmented-export-range"
            value={rangeInput}
            placeholder={t("segmentedExportRangePlaceholder")}
            onChange={(event) => setRangeInput(event.target.value)}
          />
          <button className="segmented-export-button" onClick={applyRangeSelection}>
            {t("segmentedExportApplyRange")}
          </button>
          <button className="segmented-export-button" onClick={() => setVisibleSelection(true)}>
            {t("segmentedExportSelectVisible")}
          </button>
          <button className="segmented-export-button" onClick={() => setVisibleSelection(false)}>
            {t("segmentedExportClearVisible")}
          </button>
          <button className="segmented-export-button" onClick={invertVisibleSelection}>
            {t("segmentedExportInvertVisible")}
          </button>
        </div>
      </div>

      <div className="segmented-export-list">
        {filteredSegments.length === 0 ? (
          <div className="segmented-export-empty">{t("segmentedExportNoMatches")}</div>
        ) : (
          filteredSegments.map((segment) => {
            const selected = selectedIds.has(segment.id)
            return (
              <label
                key={segment.id}
                className={`segmented-export-row${selected ? " is-selected" : ""}`}>
                <input
                  className="segmented-export-checkbox"
                  type="checkbox"
                  checked={selected}
                  onChange={() => toggleSegment(segment.id)}
                />
                <span className="segmented-export-index">{segment.index}</span>
                <span className="segmented-export-segment-main">
                  <span className="segmented-export-segment-title">{segment.title}</span>
                  <span className="segmented-export-meta">
                    {t("segmentedExportSegmentMeta")
                      .replace("{users}", String(segment.userMessageCount))
                      .replace("{assistants}", String(segment.assistantMessageCount))
                      .replace("{chars}", String(segment.characterCount))}
                  </span>
                  <span className="segmented-export-preview">{segment.preview}</span>
                </span>
              </label>
            )
          })
        )}
      </div>

      <div className="segmented-export-footer">
        <div className="segmented-export-count">
          {t("segmentedExportSelected")
            .replace("{selected}", String(selectedCount))
            .replace("{total}", String(draft.segments.length))}
        </div>
        <div className="segmented-export-footer-actions">
          <select
            className="segmented-export-select"
            value={mode}
            onChange={(event) => setMode(event.target.value as ConversationSegmentedExportMode)}>
            <option value="zip-markdown">{t("segmentedExportModeZip")}</option>
            <option value="merged-markdown">{t("segmentedExportModeMerged")}</option>
            <option value="clipboard">{t("segmentedExportModeClipboard")}</option>
          </select>
          <button className="segmented-export-button" disabled={isExporting} onClick={onCancel}>
            {t("cancel")}
          </button>
          <button
            className="segmented-export-button segmented-export-primary"
            disabled={isExporting || selectedCount === 0}
            onClick={() => onExport(Array.from(selectedIds), mode)}>
            {isExporting ? t("exportOverlayPreparing") : t("segmentedExportExportSelected")}
          </button>
        </div>
      </div>
    </DialogOverlay>
  )
}

export default SegmentedExportDialog
