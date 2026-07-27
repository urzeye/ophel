import React from "react"
import { createPortal } from "react-dom"

import { Button } from "~components/ui"
import { SUPPORTED_AI_PLATFORMS } from "~constants/defaults"
import { OPHEL_HOVER_WIDTH_RETAIN_LAYER_PROPS } from "~utils/dom-toolkit"
import { getHighlightStyles, renderMarkdown } from "~utils/markdown"
import { showCopySuccess } from "~utils/icons"
import { t } from "~utils/i18n"
import type { Prompt } from "~utils/storage"
import { createSafeHTML } from "~utils/trusted-types"

import { PlatformIcon } from "./PlatformIcon"

const PROMPT_EDITOR_PLATFORM_STYLES = `
.gh-prompt-platform-chip {
  min-height: 30px;
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 3px 9px;
  border: 1px solid transparent;
  border-radius: 12px;
  background: var(--gh-hover, #f3f4f6);
  color: var(--gh-text-secondary, #6b7280);
  font: inherit;
  font-size: 12px;
  cursor: pointer;
  transition:
    background 0.15s,
    border-color 0.15s,
    color 0.15s;
}

.gh-prompt-platform-chip[aria-pressed="true"] {
  border-color: var(--gh-primary, #4285f4);
  background: var(--gh-primary, #4285f4);
  color: var(--gh-text-on-primary, #ffffff);
}

.gh-prompt-platform-chip:hover {
  filter: brightness(0.97);
}

.gh-prompt-platform-chip:active {
  transform: translateY(1px);
}

.gh-prompt-platform-chip:focus-visible {
  outline: 2px solid var(--gh-primary, #4285f4);
  outline-offset: 2px;
}
`

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
  if (!isOpen) return null

  return createPortal(
    <div
      className="prompt-modal gh-interactive"
      {...OPHEL_HOVER_WIDTH_RETAIN_LAYER_PROPS}
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: "var(--gh-overlay-bg)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 2147483646,
        animation: "fadeIn 0.2s",
      }}>
      <div
        className="prompt-modal-content"
        role="dialog"
        aria-modal="true"
        aria-labelledby="gh-prompt-editor-title"
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "var(--gh-bg, white)",
          borderRadius: "12px",
          width: "90%",
          maxWidth: "500px",
          padding: "24px",
          maxHeight: "calc(100vh - 32px)",
          overflowY: "auto",
          boxSizing: "border-box",
          animation: "slideUp 0.3s",
          boxShadow: "var(--gh-shadow, 0 20px 50px rgba(0,0,0,0.3))",
        }}>
        <div
          id="gh-prompt-editor-title"
          style={{
            fontSize: "18px",
            fontWeight: 600,
            marginBottom: "20px",
            color: "var(--gh-text, #1f2937)",
          }}>
          {editingPrompt?.id ? t("editPrompt") : t("addNewPrompt")}
        </div>

        {/* 标题 */}
        <div style={{ marginBottom: "16px" }}>
          <label
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
                <span
                  key={cat}
                  onClick={() => setEditingPrompt({ ...editingPrompt, category: cat })}
                  style={{
                    padding: "2px 8px",
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
                </span>
              ))}
            </div>
          )}
        </div>

        {/* 适用平台（多选；不选表示所有平台） */}
        <div style={{ marginBottom: "16px" }}>
          <div
            id="gh-prompt-platform-label"
            style={{
              display: "block",
              fontSize: "14px",
              fontWeight: 500,
              color: "var(--gh-text, #374151)",
              marginBottom: "6px",
            }}>
            {t("promptPlatformLabel")}
          </div>
          <div
            id="gh-prompt-platform-hint"
            style={{
              fontSize: "12px",
              color: "var(--gh-text-tertiary, #9ca3af)",
              marginBottom: "8px",
            }}>
            {t("promptPlatformHint")}
          </div>
          <div
            role="group"
            aria-labelledby="gh-prompt-platform-label"
            aria-describedby="gh-prompt-platform-hint"
            style={{
              display: "flex",
              gap: "6px",
              flexWrap: "wrap",
              userSelect: "none",
            }}>
            {SUPPORTED_AI_PLATFORMS.map((platform) => {
              const selected = editingPrompt?.platforms?.includes(platform.id) ?? false
              return (
                <button
                  type="button"
                  key={platform.id}
                  className="gh-prompt-platform-chip"
                  aria-pressed={selected}
                  onClick={() => {
                    const current = editingPrompt?.platforms ?? []
                    const next = current.includes(platform.id)
                      ? current.filter((id) => id !== platform.id)
                      : [...current, platform.id]
                    setEditingPrompt({
                      ...editingPrompt,
                      platforms: next.length > 0 ? next : undefined,
                    })
                  }}>
                  <PlatformIcon name={platform.name} size={16} />
                  {platform.name}
                </button>
              )
            })}
          </div>
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
                style={{
                  fontSize: "14px",
                  fontWeight: 500,
                  color: "var(--gh-text, #374151)",
                }}>
                {t("content")}
              </label>
              {/* ⭐ 预览开关 */}
              <button
                onClick={() => setShowPreview(!showPreview)}
                style={{
                  padding: "2px 8px",
                  fontSize: "12px",
                  background: showPreview
                    ? "var(--gh-primary, #4285f4)"
                    : "var(--gh-hover, #f3f4f6)",
                  color: showPreview ? "white" : "var(--gh-text-secondary, #6b7280)",
                  border: "1px solid var(--gh-border, #d1d5db)",
                  borderRadius: "4px",
                  cursor: "pointer",
                }}>
                {t("promptMarkdownPreview")}
              </button>
            </div>
            <textarea
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
            {/* ⭐ Markdown 预览区域 */}
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
                    // 事件委托处理复制按钮（支持点击 SVG 内部）
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

        {/* 按钮 */}
        <div
          style={{ display: "flex", gap: "12px", justifyContent: "flex-end", marginTop: "24px" }}>
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
      </div>
      <style>{PROMPT_EDITOR_PLATFORM_STYLES}</style>
    </div>,
    document.body,
  )
}
