/**
 * 自定义样式编辑器弹窗
 * 走共享 DialogOverlay（portal 到宿主页 body，层级、遮罩与 Esc 行为和其他弹窗一致）。
 * portal 后拿不到 Shadow DOM 里的设置页样式，编辑器自身样式随弹窗注入，颜色仍取主题变量。
 */
import hljs from "highlight.js/lib/core"
import css from "highlight.js/lib/languages/css"
import React from "react"

import { ClearIcon, ThemeDarkIcon, ThemeLightIcon } from "~components/icons"
import { DialogOverlay, Tooltip } from "~components/ui"
import { t } from "~utils/i18n"
import type { CustomStyle } from "~utils/storage"
import { createSafeHTML } from "~utils/trusted-types"

import { SafeCodeEditor } from "./SafeCodeEditor"

hljs.registerLanguage("css", css)

const STYLE_EDITOR_DIALOG_STYLES = `
  .gh-dialog.gh-style-editor-dialog {
    display: flex;
    flex-direction: column;
    width: min(960px, calc(100vw - 40px));
    max-width: none;
    height: min(85vh, 820px);
    padding: 0;
    border: 1px solid var(--gh-card-border, var(--gh-border, #e5e7eb));
    border-radius: 16px;
    overflow: hidden;
    color: var(--gh-text, #1f2937);
  }
  .gh-style-editor-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 16px 18px;
    border-bottom: 1px solid var(--gh-border, #e5e7eb);
  }
  .gh-style-editor-title {
    margin: 0;
    font-size: 16px;
    font-weight: 600;
    color: var(--gh-text, #1f2937);
  }
  .gh-style-editor-close {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    padding: 0;
    border: none;
    border-radius: 8px;
    background: var(--gh-bg-secondary, #f3f4f6);
    color: var(--gh-text-secondary, #6b7280);
    cursor: pointer;
    transition: background-color 0.16s ease, color 0.16s ease;
  }
  .gh-style-editor-close:hover {
    background: var(--gh-hover, #e5e7eb);
    color: var(--gh-text, #374151);
  }
  .gh-style-editor-close:focus-visible,
  .gh-style-editor-mode:focus-within {
    outline: 2px solid color-mix(in srgb, var(--gh-primary, #4285f4) 42%, transparent);
    outline-offset: 2px;
  }
  .gh-style-editor-body {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
    gap: 18px;
    padding: 18px;
    overflow-y: auto;
  }
  .gh-style-editor-field {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .gh-style-editor-label {
    font-size: 13px;
    font-weight: 600;
    color: var(--gh-text, #374151);
  }
  .gh-style-editor-input {
    width: 100%;
    box-sizing: border-box;
    padding: 8px 12px;
    border: 1px solid var(--gh-input-border, #d1d5db);
    border-radius: 8px;
    background: var(--gh-input-bg, #ffffff);
    color: var(--gh-text, #1f2937);
    font: inherit;
    font-size: 13px;
  }
  .gh-style-editor-input:focus {
    outline: none;
    border-color: var(--gh-primary, #4285f4);
    box-shadow: 0 0 0 2px color-mix(in srgb, var(--gh-primary, #4285f4) 18%, transparent);
  }
  .gh-style-editor-modes {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
  }
  .gh-style-editor-mode {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 8px 12px;
    border: 1px solid var(--gh-border, #e5e7eb);
    border-radius: 10px;
    background: var(--gh-bg-secondary, #f9fafb);
    color: var(--gh-text, #374151);
    font-size: 13px;
    cursor: pointer;
  }
  /* 宿主页（如 ChatGPT）可能对 input 全局 appearance:none，这里恢复原生单选框 */
  .gh-style-editor-mode input {
    margin: 0;
    appearance: auto;
    accent-color: var(--gh-primary, #4285f4);
  }
  .gh-style-editor-mode-text {
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }
  .gh-style-editor-code {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .gh-style-editor-code-frame {
    flex: 1;
    min-height: 320px;
    border: 1px solid var(--gh-input-border, #d1d5db);
    border-radius: 8px;
    background: var(--gh-bg-secondary, #f9fafb);
    color: var(--gh-text, #374151);
    overflow: auto;
  }
  .gh-style-editor-code-frame:focus-within {
    border-color: var(--gh-primary, #4285f4);
  }
  .gh-style-editor-code-frame textarea:focus {
    outline: none;
  }
  .gh-style-editor-footer {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    padding: 14px 18px;
    border-top: 1px solid var(--gh-border, #e5e7eb);
  }
  @media (max-width: 720px) {
    .gh-dialog.gh-style-editor-dialog {
      width: calc(100vw - 20px);
      height: calc(100vh - 20px);
      border-radius: 14px;
    }
    .gh-style-editor-footer .gh-dialog-btn {
      flex: 1 1 160px;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .gh-style-editor-close {
      transition: none;
    }
  }
`

interface CustomStyleEditorDialogProps {
  style: CustomStyle
  onChange: (style: CustomStyle) => void
  onSave: () => void
  onClose: () => void
}

export const CustomStyleEditorDialog: React.FC<CustomStyleEditorDialogProps> = ({
  style,
  onChange,
  onSave,
  onClose,
}) => {
  const isEditing = Boolean(style.id)

  return (
    // 点遮罩不关闭，避免误触丢掉正在编辑的 CSS
    <DialogOverlay
      onClose={onClose}
      closeOnOverlayClick={false}
      dialogClassName="gh-style-editor-dialog">
      <style>{STYLE_EDITOR_DIALOG_STYLES}</style>
      <div className="gh-style-editor-header">
        <h3 className="gh-style-editor-title">{isEditing ? t("editStyleTitle") : t("newStyle")}</h3>
        <Tooltip content={t("close")}>
          <button
            type="button"
            className="gh-style-editor-close"
            onClick={onClose}
            aria-label={t("close")}>
            <ClearIcon size={16} />
          </button>
        </Tooltip>
      </div>

      <div className="gh-style-editor-body">
        <label className="gh-style-editor-field">
          <span className="gh-style-editor-label">{t("styleNameLabel")}</span>
          <input
            type="text"
            className="gh-style-editor-input"
            value={style.name}
            onChange={(e) => onChange({ ...style, name: e.target.value })}
            placeholder={t("enterStyleName")}
            autoFocus
          />
        </label>

        <div className="gh-style-editor-field">
          <span className="gh-style-editor-label">{t("styleModeLabel")}</span>
          <div className="gh-style-editor-modes">
            <label className="gh-style-editor-mode">
              <input
                type="radio"
                checked={style.mode === "light"}
                onChange={() => onChange({ ...style, mode: "light" })}
              />
              <span className="gh-style-editor-mode-text">
                <ThemeLightIcon size={14} />
                <span>{t("lightMode")}</span>
              </span>
            </label>
            <label className="gh-style-editor-mode">
              <input
                type="radio"
                checked={style.mode === "dark"}
                onChange={() => onChange({ ...style, mode: "dark" })}
              />
              <span className="gh-style-editor-mode-text">
                <ThemeDarkIcon size={14} />
                <span>{t("darkMode")}</span>
              </span>
            </label>
          </div>
        </div>

        <div className="gh-style-editor-code">
          <span className="gh-style-editor-label">CSS {t("code")}</span>
          <div className="gh-style-editor-code-frame">
            <SafeCodeEditor
              value={style.css}
              onValueChange={(code) => onChange({ ...style, css: code })}
              highlight={(code) => createSafeHTML(hljs.highlight(code, { language: "css" }).value)}
              padding={12}
              style={{
                fontFamily: '"Menlo", "Monaco", "Consolas", monospace',
                fontSize: 13,
                minHeight: "100%",
              }}
              textareaClassName="focus-outline-none"
            />
          </div>
        </div>
      </div>

      <div className="gh-style-editor-footer">
        <button type="button" className="gh-dialog-btn gh-dialog-btn-secondary" onClick={onClose}>
          {t("cancel")}
        </button>
        <button type="button" className="gh-dialog-btn gh-dialog-btn-primary" onClick={onSave}>
          {isEditing ? t("save") : t("create")}
        </button>
      </div>
    </DialogOverlay>
  )
}

export default CustomStyleEditorDialog
