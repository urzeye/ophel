import React from "react"
import { createPortal } from "react-dom"

import { ClearIcon } from "~components/icons"
import { OPHEL_HOVER_WIDTH_RETAIN_LAYER_PROPS } from "~utils/dom-toolkit"
import { showCopySuccess } from "~utils/icons"
import { t } from "~utils/i18n"
import { getHighlightStyles, renderMarkdown } from "~utils/markdown"
import type { Prompt } from "~utils/storage"
import { createSafeHTML } from "~utils/trusted-types"

interface PromptPreviewModalProps {
  isOpen: boolean
  prompt: Prompt | null
  previewRef: React.RefObject<HTMLDivElement>
  onClose: () => void
  getCategoryColorIndex: (categoryName: string) => number
  getResolvedCategoryColor: (colorIndex: number) => string
}

const PROMPT_PREVIEW_MODAL_STYLES = `
@keyframes ghPromptPreviewFadeIn {
  from {
    opacity: 0;
  }

  to {
    opacity: 1;
  }
}

@keyframes ghPromptPreviewSlideUp {
  from {
    opacity: 0;
    transform: translateY(18px);
  }

  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.gh-prompt-preview-overlay {
  position: fixed;
  inset: 0;
  z-index: 10001;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
  box-sizing: border-box;
  background: var(--gh-overlay-bg, rgba(0, 0, 0, 0.5));
  animation: ghPromptPreviewFadeIn 0.2s ease-out;
}

.gh-prompt-preview-dialog {
  width: min(640px, 100%);
  max-height: min(82vh, 760px);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border: 1px solid color-mix(in srgb, var(--gh-primary, #4285f4) 12%, var(--gh-border, #e5e7eb));
  border-radius: 14px;
  background: var(--gh-bg, #ffffff);
  color: var(--gh-text, #1f2937);
  box-shadow: var(--gh-shadow-lg, 0 20px 60px rgba(0, 0, 0, 0.3));
  font-family:
    system-ui,
    -apple-system,
    BlinkMacSystemFont,
    "Segoe UI",
    sans-serif;
  animation: ghPromptPreviewSlideUp 0.24s ease-out;
}

.gh-prompt-preview-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 14px;
  padding: 17px 20px 15px;
  border-bottom: 1px solid var(--gh-border, #e5e7eb);
  background: linear-gradient(
    180deg,
    color-mix(in srgb, var(--gh-primary, #4285f4) 5%, var(--gh-bg, #ffffff)) 0%,
    var(--gh-bg, #ffffff) 100%
  );
}

.gh-prompt-preview-title-block {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 0;
}

.gh-prompt-preview-title-row {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 10px;
  max-width: 100%;
}

.gh-prompt-preview-title {
  min-width: 0;
  flex: 0 1 auto;
  overflow: hidden;
  color: var(--gh-text, #1f2937);
  font-size: 17px;
  font-weight: 650;
  letter-spacing: -0.01em;
  line-height: 1.35;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.gh-prompt-preview-category {
  max-width: min(260px, 100%);
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  min-height: 22px;
  padding: 2px 8px;
  box-sizing: border-box;
  border: 1px solid
    color-mix(
      in srgb,
      var(--gh-prompt-preview-category-bg, var(--gh-hover, #f3f4f6)) 72%,
      var(--gh-border, #e5e7eb)
    );
  border-radius: 999px;
  background: var(--gh-prompt-preview-category-bg, var(--gh-hover, #f3f4f6));
  color: var(--gh-prompt-preview-category-text, #1f2937);
  box-shadow: inset 0 0 0 1px color-mix(in srgb, #ffffff 18%, transparent);
  font-size: 12px;
  font-weight: 500;
  line-height: 1.15;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.gh-prompt-preview-close {
  width: 32px;
  height: 32px;
  flex: 0 0 32px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid transparent;
  border-radius: 8px;
  background: var(--gh-hover, #f3f4f6);
  color: var(--gh-text-secondary, #6b7280);
  cursor: pointer;
  transition:
    background 0.15s ease,
    border-color 0.15s ease,
    color 0.15s ease,
    transform 0.15s ease;
}

.gh-prompt-preview-close:hover {
  border-color: color-mix(in srgb, var(--gh-primary, #4285f4) 18%, var(--gh-border, #e5e7eb));
  background: color-mix(in srgb, var(--gh-primary, #4285f4) 8%, var(--gh-hover, #f3f4f6));
  color: var(--gh-text, #1f2937);
}

.gh-prompt-preview-close:active {
  transform: translateY(1px);
}

.gh-prompt-preview-close:focus-visible {
  outline: 2px solid var(--gh-primary, #4285f4);
  outline-offset: 2px;
}

.gh-prompt-preview-body.gh-markdown-preview {
  flex: 1;
  min-height: 0;
  padding: 20px 22px 22px;
  overflow-y: auto;
  background: color-mix(in srgb, var(--gh-bg-secondary, #f9fafb) 34%, var(--gh-bg, #ffffff));
  color: var(--gh-text, #1f2937);
  font-size: 13px;
  line-height: 1.65;
  overscroll-behavior: contain;
  scrollbar-gutter: stable;
  scrollbar-width: thin;
  scrollbar-color: color-mix(in srgb, var(--gh-text-tertiary, #9ca3af) 62%, transparent)
    transparent;
}

.gh-prompt-preview-body.gh-markdown-preview::-webkit-scrollbar {
  width: 10px;
}

.gh-prompt-preview-body.gh-markdown-preview::-webkit-scrollbar-track {
  background: transparent;
}

.gh-prompt-preview-body.gh-markdown-preview::-webkit-scrollbar-thumb {
  min-height: 44px;
  border: 3px solid transparent;
  border-radius: 999px;
  background: color-mix(in srgb, var(--gh-text-tertiary, #9ca3af) 56%, transparent);
  background-clip: content-box;
}

.gh-prompt-preview-body.gh-markdown-preview::-webkit-scrollbar-thumb:hover {
  background: color-mix(in srgb, var(--gh-text-secondary, #6b7280) 72%, transparent);
  background-clip: content-box;
}

.gh-prompt-preview-body.gh-markdown-preview > :first-child {
  margin-top: 0;
}

.gh-prompt-preview-body.gh-markdown-preview > :last-child {
  margin-bottom: 0;
}

@media (max-width: 520px) {
  .gh-prompt-preview-overlay {
    padding: 12px;
  }

  .gh-prompt-preview-dialog {
    max-height: 86vh;
    border-radius: 12px;
  }

  .gh-prompt-preview-header {
    padding: 14px 15px 13px;
  }

  .gh-prompt-preview-title {
    white-space: normal;
  }

  .gh-prompt-preview-title-row {
    align-items: flex-start;
    flex-wrap: wrap;
    gap: 7px;
  }

  .gh-prompt-preview-body.gh-markdown-preview {
    padding: 16px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .gh-prompt-preview-overlay,
  .gh-prompt-preview-dialog {
    animation: none;
  }

  .gh-prompt-preview-close {
    transition: none;
  }
}
`

export const PromptPreviewModal = ({
  isOpen,
  prompt,
  previewRef,
  onClose,
  getCategoryColorIndex,
  getResolvedCategoryColor,
}: PromptPreviewModalProps) => {
  if (!isOpen || !prompt) return null

  const categoryLabel = prompt.category || t("uncategorized")
  const categoryColorIndex = getCategoryColorIndex(categoryLabel)
  const categoryStyle = {
    "--gh-prompt-preview-category-bg": getResolvedCategoryColor(categoryColorIndex),
    "--gh-prompt-preview-category-text": "#1f2937",
  } as React.CSSProperties

  return createPortal(
    <>
      <style>{PROMPT_PREVIEW_MODAL_STYLES}</style>
      <div
        className="gh-prompt-preview-overlay gh-interactive"
        {...OPHEL_HOVER_WIDTH_RETAIN_LAYER_PROPS}
        onClick={(e) => {
          if (e.target === e.currentTarget) {
            onClose()
          }
        }}>
        <div
          className="gh-prompt-preview-dialog"
          role="dialog"
          aria-modal="true"
          aria-label={prompt.title}
          onClick={(e) => e.stopPropagation()}>
          {/* 标题栏 */}
          <div className="gh-prompt-preview-header">
            <div className="gh-prompt-preview-title-block">
              <div className="gh-prompt-preview-title-row">
                <div className="gh-prompt-preview-title">{prompt.title}</div>
                <span className="gh-prompt-preview-category" style={categoryStyle}>
                  {categoryLabel}
                </span>
              </div>
            </div>
            <button
              type="button"
              className="gh-prompt-preview-close"
              aria-label={t("close")}
              onClick={onClose}>
              <ClearIcon size={16} />
            </button>
          </div>
          {/* 内容区域 */}
          <div
            className="gh-prompt-preview-body gh-markdown-preview"
            ref={previewRef}
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
              __html: createSafeHTML(renderMarkdown(prompt.content)),
            }}
          />
          {/* highlight.js 样式 */}
          <style>{getHighlightStyles()}</style>
        </div>
      </div>
    </>,
    document.body,
  )
}
