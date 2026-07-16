import React, { useId } from "react"

import { Button, DialogOverlay } from "~components/ui"
import { getHighlightStyles, renderMarkdown } from "~utils/markdown"
import { showCopySuccess } from "~utils/icons"
import { t } from "~utils/i18n"
import type { Prompt } from "~utils/storage"
import { createSafeHTML } from "~utils/trusted-types"

interface PromptEditorDialogProps {
  isOpen: boolean
  editingPrompt: Partial<Prompt> | null
  setEditingPrompt: React.Dispatch<React.SetStateAction<Partial<Prompt> | null>>
  categories: string[]
  showPreview: boolean
  setShowPreview: React.Dispatch<React.SetStateAction<boolean>>
  editPreviewRef: React.RefObject<HTMLDivElement>
  onClose: () => void
  onSave: () => void
}

export const PromptEditorDialog: React.FC<PromptEditorDialogProps> = ({
  isOpen,
  editingPrompt,
  setEditingPrompt,
  categories,
  showPreview,
  setShowPreview,
  editPreviewRef,
  onClose,
  onSave,
}) => {
  const fieldId = useId().replace(/:/g, "")
  const titleInputId = `gh-prompt-title-${fieldId}`
  const categoryInputId = `gh-prompt-category-${fieldId}`
  const contentInputId = `gh-prompt-content-${fieldId}`
  if (!isOpen) return null

  return (
    <DialogOverlay
      onClose={onClose}
      closeOnOverlayClick={false}
      overlayClassName="prompt-modal"
      dialogClassName="prompt-modal-content"
      dialogStyle={{ width: "90%", maxWidth: "500px", padding: "24px" }}>
      <div
        className="gh-dialog-title"
        style={{
          fontSize: "18px",
          marginBottom: "20px",
        }}>
        {editingPrompt?.id ? t("editPrompt") : t("addNewPrompt")}
      </div>

      {/* 标题 */}
      <div style={{ marginBottom: "16px" }}>
        <label
          htmlFor={titleInputId}
          style={{
            display: "block",
            fontSize: "14px",
            fontWeight: 500,
            color: "var(--gh-text, #374151)",
            marginBottom: "6px",
          }}>
          {t("title")}
        </label>
        <input
          id={titleInputId}
          type="text"
          value={editingPrompt?.title || ""}
          onChange={(e) => setEditingPrompt({ ...editingPrompt, title: e.target.value })}
          style={{
            width: "100%",
            padding: "8px 12px",
            border: "1px solid var(--gh-border, #d1d5db)",
            borderRadius: "6px",
            fontSize: "14px",
            boxSizing: "border-box",
            background: "var(--gh-bg, #ffffff)",
            color: "var(--gh-text, #1f2937)",
          }}
        />
      </div>

      {/* 分类 */}
      <div style={{ marginBottom: "16px" }}>
        <label
          htmlFor={categoryInputId}
          style={{
            display: "block",
            fontSize: "14px",
            fontWeight: 500,
            color: "var(--gh-text, #374151)",
            marginBottom: "6px",
          }}>
          {t("category")}
        </label>
        <input
          id={categoryInputId}
          type="text"
          value={editingPrompt?.category || ""}
          onChange={(e) => setEditingPrompt({ ...editingPrompt, category: e.target.value })}
          placeholder={t("categoryPlaceholder")}
          style={{
            width: "100%",
            padding: "8px 12px",
            border: "1px solid var(--gh-border, #d1d5db)",
            borderRadius: "6px",
            fontSize: "14px",
            boxSizing: "border-box",
            background: "var(--gh-bg, #ffffff)",
            color: "var(--gh-text, #1f2937)",
          }}
        />
        {categories.length > 0 && (
          <div
            style={{
              marginTop: "6px",
              display: "flex",
              gap: "4px",
              flexWrap: "wrap",
              userSelect: "none",
            }}>
            {categories.map((cat) => (
              <button
                type="button"
                key={cat}
                onClick={() => setEditingPrompt({ ...editingPrompt, category: cat })}
                style={{
                  padding: "2px 8px",
                  border: 0,
                  fontSize: "11px",
                  background:
                    editingPrompt?.category === cat
                      ? "var(--gh-primary, #4285f4)"
                      : "var(--gh-hover, #f3f4f6)",
                  color:
                    editingPrompt?.category === cat
                      ? "var(--gh-text-on-primary, white)"
                      : "var(--gh-text-secondary, #6b7280)",
                  borderRadius: "10px",
                  cursor: "pointer",
                  transition: "all 0.15s",
                }}>
                {cat}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* 内容 */}
      <div style={{ marginBottom: "16px" }}>
        <div>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: "6px",
            }}>
            <label
              htmlFor={contentInputId}
              style={{
                fontSize: "14px",
                fontWeight: 500,
                color: "var(--gh-text, #374151)",
              }}>
              {t("content")}
            </label>
            <button
              type="button"
              onClick={() => setShowPreview(!showPreview)}
              style={{
                padding: "2px 8px",
                fontSize: "12px",
                background: showPreview ? "var(--gh-primary, #4285f4)" : "var(--gh-hover, #f3f4f6)",
                color: showPreview ? "white" : "var(--gh-text-secondary, #6b7280)",
                border: "1px solid var(--gh-border, #d1d5db)",
                borderRadius: "4px",
                cursor: "pointer",
              }}
              aria-pressed={showPreview}>
              {t("promptMarkdownPreview")}
            </button>
          </div>
          <textarea
            id={contentInputId}
            value={editingPrompt?.content || ""}
            onChange={(e) => setEditingPrompt({ ...editingPrompt, content: e.target.value })}
            style={{
              width: "100%",
              minHeight: "120px",
              padding: "8px 12px",
              border: "1px solid var(--gh-border, #d1d5db)",
              borderRadius: "6px",
              fontSize: "14px",
              resize: "vertical",
              boxSizing: "border-box",
              fontFamily: "inherit",
              background: "var(--gh-bg, #ffffff)",
              color: "var(--gh-text, #1f2937)",
              display: showPreview ? "none" : "block",
            }}
          />
          {showPreview && (
            <>
              <div
                className="gh-markdown-preview"
                style={{
                  width: "100%",
                  minHeight: "120px",
                  maxHeight: "200px",
                  padding: "8px 12px",
                  border: "1px solid var(--gh-border, #d1d5db)",
                  borderRadius: "6px",
                  fontSize: "14px",
                  boxSizing: "border-box",
                  background: "var(--gh-bg-secondary, #f9fafb)",
                  color: "var(--gh-text, #1f2937)",
                  overflowY: "auto",
                  lineHeight: 1.6,
                }}
                ref={editPreviewRef}
                onClick={(e) => {
                  const target = e.target as HTMLElement
                  const btn = target.closest(".gh-code-copy-btn") as HTMLElement
                  if (btn) {
                    const code = btn.nextElementSibling?.textContent || ""
                    navigator.clipboard.writeText(code).then(() => {
                      showCopySuccess(btn, { size: 14 })
                    })
                  }
                }}
                dangerouslySetInnerHTML={{
                  __html: createSafeHTML(renderMarkdown(editingPrompt?.content || "")),
                }}
              />
              <style>{getHighlightStyles()}</style>
            </>
          )}
        </div>
      </div>

      <div style={{ display: "flex", gap: "12px", justifyContent: "flex-end", marginTop: "24px" }}>
        <Button
          variant="ghost"
          onClick={onClose}
          style={{ background: "var(--gh-hover, #f3f4f6)" }}>
          {t("cancel")}
        </Button>
        <Button variant="primary" onClick={onSave}>
          {editingPrompt?.id ? t("save") : t("add")}
        </Button>
      </div>
    </DialogOverlay>
  )
}
