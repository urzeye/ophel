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

import { SafeCodeEditor } from "./SafeCodeEditor"

hljs.registerLanguage("css", css)

const HTML_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
}

function decodeHighlightText(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, entity: string) => {
    if (entity.startsWith("#")) {
      const codePoint =
        entity[1].toLowerCase() === "x"
          ? Number.parseInt(entity.slice(2), 16)
          : Number.parseInt(entity.slice(1), 10)
      return Number.isInteger(codePoint) && codePoint >= 0 && codePoint <= 0x10ffff
        ? String.fromCodePoint(codePoint)
        : match
    }
    return HTML_ENTITIES[entity.toLowerCase()] ?? match
  })
}

/**
 * highlight.js 输出的是 HTML 字符串。这里转成 React 节点，
 * 避免把 TrustedHTML 交给 react-simple-code-editor 当 children 渲染。
 */
function highlightHtmlToReact(html: string): React.ReactNode {
  const root: React.ReactNode[] = []
  const stack: Array<{ className: string; children: React.ReactNode[] }> = []
  let key = 0

  const currentChildren = () => (stack.length ? stack[stack.length - 1].children : root)
  const append = (node: React.ReactNode) => currentChildren().push(node)

  for (const part of html.split(/(<span class="[^"]*">|<\/span>)/g)) {
    if (!part) continue

    if (part === "</span>") {
      const node = stack.pop()
      if (node) {
        append(
          React.createElement(
            "span",
            { key: `token-${key++}`, className: node.className },
            node.children,
          ),
        )
      }
      continue
    }

    if (part.startsWith('<span class="')) {
      stack.push({ className: part.slice('<span class="'.length, -2), children: [] })
      continue
    }

    append(decodeHighlightText(part))
  }

  // highlight.js 的输出是闭合的；这里兜底处理异常片段，避免丢内容。
  while (stack.length) {
    const node = stack.pop()!
    append(
      React.createElement(
        "span",
        { key: `token-${key++}`, className: node.className },
        node.children,
      ),
    )
  }

  root.push(React.createElement("br", { key: "trailing-line" }))
  return root
}

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
    /* 代码框随高度自适应；只有极矮视口才让表单区整体滚动，正常尺寸不会出现外层滚动条 */
    overflow: auto;
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
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .gh-style-editor-code-frame {
    flex: 1;
    /* 保留最小编辑高度：极矮视口下由 body 整体滚动，而不是把代码框压到不可用 */
    min-height: 160px;
    border: 1px solid var(--gh-input-border, #d1d5db);
    border-radius: 8px;
    background: var(--gh-bg-secondary, #f9fafb);
    color: var(--gh-text, #374151);
    overflow: auto;
    scrollbar-width: thin;
    scrollbar-color: var(--gh-border, #d1d5db) transparent;
    scrollbar-gutter: stable;
  }
  .gh-style-editor-code-frame::-webkit-scrollbar {
    width: 10px;
    height: 10px;
  }
  .gh-style-editor-code-frame::-webkit-scrollbar-track,
  .gh-style-editor-code-frame::-webkit-scrollbar-corner {
    background: transparent;
  }
  .gh-style-editor-code-frame::-webkit-scrollbar-thumb {
    min-height: 40px;
    border: 3px solid transparent;
    border-radius: 999px;
    background: color-mix(in srgb, var(--gh-text-tertiary, #8d94a1) 58%, transparent);
    background-clip: content-box;
  }
  .gh-style-editor-code-frame::-webkit-scrollbar-thumb:hover {
    background: color-mix(in srgb, var(--gh-text-tertiary, #8d94a1) 80%, transparent);
    background-clip: content-box;
  }
  .gh-style-editor-code-frame:focus-within {
    border-color: var(--gh-primary, #4285f4);
  }
  .gh-style-editor-code-frame textarea:focus {
    outline: none;
  }
  .gh-style-editor-code-frame .hljs-comment,
  .gh-style-editor-code-frame .hljs-quote {
    color: var(--gh-text-tertiary, #8d94a1);
    font-style: italic;
  }
  .gh-style-editor-code-frame .hljs-keyword,
  .gh-style-editor-code-frame .hljs-selector-tag,
  .gh-style-editor-code-frame .hljs-doctag {
    color: var(--gh-danger, #ef4444);
  }
  .gh-style-editor-code-frame .hljs-selector-class,
  .gh-style-editor-code-frame .hljs-selector-id,
  .gh-style-editor-code-frame .hljs-selector-pseudo,
  .gh-style-editor-code-frame .hljs-title,
  .gh-style-editor-code-frame .hljs-section {
    color: var(--gh-primary, #4285f4);
  }
  .gh-style-editor-code-frame .hljs-string,
  .gh-style-editor-code-frame .hljs-attr,
  .gh-style-editor-code-frame .hljs-attribute {
    color: var(--gh-secondary, #34a853);
  }
  .gh-style-editor-code-frame .hljs-number,
  .gh-style-editor-code-frame .hljs-literal,
  .gh-style-editor-code-frame .hljs-built_in {
    color: var(--gh-primary, #4285f4);
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
              highlight={(code) =>
                highlightHtmlToReact(hljs.highlight(code, { language: "css" }).value)
              }
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
