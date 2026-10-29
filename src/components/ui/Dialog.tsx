import React, { useEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"

import {
  attachEditableKeyboardFocusGuard,
  OPHEL_HOVER_WIDTH_RETAIN_LAYER_PROPS,
} from "~utils/dom-toolkit"
import { t } from "~utils/i18n"

// ==================== 对话框样式 ====================

const DIALOG_STYLES = `
  .gh-dialog-overlay {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: var(--gh-overlay-bg, rgba(0,0,0,0.5));
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 2147483647;
  }
  .gh-dialog {
    background: var(--gh-bg, white);
    border-radius: 12px;
    padding: 20px;
    min-width: 280px;
    max-width: 400px;
    box-shadow: var(--gh-shadow-lg, 0 20px 50px rgba(0,0,0,0.3));
  }
  .gh-dialog-title {
    font-size: 16px;
    font-weight: 600;
    color: var(--gh-text, #1f2937);
    margin-bottom: 12px;
  }
  .gh-dialog-message {
    font-size: 14px;
    color: var(--gh-text-secondary, #6b7280);
    margin-bottom: 20px;
    line-height: 1.5;
    white-space: pre-wrap;
  }
  .gh-dialog-buttons {
    display: flex;
    gap: 8px;
    justify-content: flex-end;
  }
  .gh-dialog-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    white-space: nowrap;
    padding: 8px 16px;
    border-radius: 6px;
    font-size: 14px;
    cursor: pointer;
    transition: all 0.2s;
    border: none;
  }
  .gh-dialog-btn-secondary {
    border: 1px solid var(--gh-border, #d1d5db);
    background: var(--gh-card-bg, var(--gh-bg, #ffffff));
    color: var(--gh-text, #374151);
  }
  .gh-dialog-btn-secondary:hover:not(:disabled) {
    background: var(--gh-hover, #f3f4f6);
  }
  .gh-dialog-btn-primary {
    background: var(--gh-primary, #4285f4);
    color: var(--gh-text-on-primary, #ffffff);
  }
  .gh-dialog-btn-primary:hover:not(:disabled) {
    background: color-mix(in srgb, var(--gh-primary, #4285f4) 88%, black);
  }
  .gh-dialog-btn-danger {
    background: var(--gh-danger, #ef4444);
    color: var(--gh-text-on-primary, #ffffff);
  }
  .gh-dialog-btn-danger:hover:not(:disabled) {
    background: color-mix(in srgb, var(--gh-danger, #ef4444) 88%, black);
  }
  .gh-dialog-btn:active:not(:disabled) {
    transform: translateY(1px);
  }
  .gh-dialog-btn:focus-visible {
    outline: 2px solid color-mix(in srgb, var(--gh-primary, #4285f4) 55%, transparent);
    outline-offset: 2px;
  }
  .gh-dialog-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  @media (prefers-reduced-motion: reduce) {
    .gh-dialog-btn,
    .gh-dialog-frame-close {
      transition: none;
    }
  }
  .gh-dialog-input {
    width: 100%;
    padding: 10px 12px;
    border: 1px solid var(--gh-border, #d1d5db);
    border-radius: 6px;
    font-size: 14px;
    box-sizing: border-box;
    margin-bottom: 20px;
    background: var(--gh-bg, #ffffff);
    color: var(--gh-text, #1f2937);
  }
  .gh-dialog-input:focus {
    outline: none;
    border-color: var(--gh-input-focus-border, #4285f4);
  }
  /* 多字段表单：标签在上、输入在下，字段之间统一间距 */
  .gh-dialog-fields {
    display: flex;
    flex-direction: column;
    gap: 16px;
    margin-bottom: 24px;
  }
  .gh-dialog-field {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .gh-dialog-label {
    font-size: 13px;
    font-weight: 500;
    color: var(--gh-text, #1f2937);
  }
  .gh-dialog-field .gh-dialog-input {
    margin-bottom: 0;
  }
  /* 固定头部 / 可滚动内容 / 固定页脚的弹窗骨架：批量加入队列、Chain 编辑器共用 */
  .gh-dialog.gh-dialog-frame {
    display: flex;
    flex-direction: column;
    max-height: 86vh;
    padding: 0;
    overflow: hidden;
  }
  .gh-dialog-frame-header,
  .gh-dialog-frame-footer {
    display: flex;
    gap: 12px;
    padding: 16px 18px;
  }
  .gh-dialog-frame-header {
    align-items: flex-start;
    justify-content: space-between;
    border-bottom: 1px solid var(--gh-border, #e5e7eb);
  }
  .gh-dialog-frame-footer {
    justify-content: flex-end;
    border-top: 1px solid var(--gh-border, #e5e7eb);
  }
  .gh-dialog-frame-title {
    color: var(--gh-text, #1f2937);
    font-size: 16px;
    font-weight: 600;
  }
  .gh-dialog-frame-subtitle {
    margin-top: 2px;
    color: var(--gh-text-secondary, #6b7280);
    font-size: 12px;
    line-height: 1.45;
  }
  .gh-dialog-frame-close {
    display: inline-flex;
    flex-shrink: 0;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    border: none;
    border-radius: 6px;
    background: var(--gh-hover, #f3f4f6);
    color: var(--gh-text-secondary, #6b7280);
    cursor: pointer;
    transition:
      background 0.15s,
      color 0.15s;
  }
  .gh-dialog-frame-close:hover {
    background: color-mix(in srgb, var(--gh-text, #1f2937) 10%, var(--gh-bg, #ffffff));
    color: var(--gh-text, #1f2937);
  }
  .gh-dialog-frame-close:focus-visible {
    outline: 2px solid color-mix(in srgb, var(--gh-primary, #4285f4) 55%, transparent);
    outline-offset: 2px;
  }
  .gh-dialog-frame-body {
    flex: 1;
    min-height: 0;
    padding: 16px 18px;
    overflow-y: auto;
    overscroll-behavior: contain;
  }
  /* 弹窗 portal 到宿主页面，宿主（如 ChatGPT 新版）对 input 全局 appearance:none
     会把原生勾选框剥成透明盒子；这里恢复原生渲染 */
  .gh-dialog-overlay input[type="checkbox"] {
    appearance: auto;
  }
`

// 样式注入状态
let dialogStyleInjected = false

const injectDialogStyles = () => {
  if (dialogStyleInjected) return
  const style = document.createElement("style")
  style.id = "gh-dialog-styles"
  style.textContent = DIALOG_STYLES
  document.head.appendChild(style)
  dialogStyleInjected = true
}

// ==================== DialogOverlay ====================

export interface DialogOverlayProps {
  children: React.ReactNode
  onClose: () => void
  closeOnOverlayClick?: boolean
  closeOnEscape?: boolean
  dialogClassName?: string
  dialogStyle?: React.CSSProperties
  /** 弹窗的可访问名称（读屏器朗读），通常传标题文字 */
  ariaLabel?: string
  /** 是否拦截弹窗内输入框的按键事件，防止宿主站点抢走焦点；默认开启 */
  editableKeyboardGuard?: boolean
}

/**
 * 对话框覆盖层 - 使用 Portal 渲染到 document.body
 */
export const DialogOverlay: React.FC<DialogOverlayProps> = ({
  children,
  onClose,
  closeOnOverlayClick = true,
  closeOnEscape = true,
  dialogClassName,
  dialogStyle,
  ariaLabel,
  editableKeyboardGuard = true,
}) => {
  const overlayRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    injectDialogStyles()

    const handleKeyDown = (e: KeyboardEvent) => {
      if (closeOnEscape && e.key === "Escape") onClose()
    }
    document.addEventListener("keydown", handleKeyDown)
    return () => document.removeEventListener("keydown", handleKeyDown)
  }, [closeOnEscape, onClose])

  useEffect(() => {
    const overlay = overlayRef.current
    if (!overlay || !editableKeyboardGuard) {
      return
    }

    // 通用弹窗内部广泛依赖本地 onKeyDown 逻辑，这里使用冒泡阶段拦截，避免吞掉确认/关闭等键盘行为。
    return attachEditableKeyboardFocusGuard(overlay, { capture: false })
  }, [editableKeyboardGuard])

  const dialogContent = (
    <div
      ref={overlayRef}
      className="gh-dialog-overlay gh-interactive"
      {...OPHEL_HOVER_WIDTH_RETAIN_LAYER_PROPS}
      onClick={closeOnOverlayClick ? onClose : undefined}>
      <div
        className={dialogClassName ? `gh-dialog ${dialogClassName}` : "gh-dialog"}
        style={dialogStyle}
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel}
        onClick={(e) => e.stopPropagation()}>
        {children}
      </div>
    </div>
  )

  return createPortal(dialogContent, document.body)
}

// ==================== ConfirmDialog ====================

export interface ConfirmDialogProps {
  title: string
  message: React.ReactNode
  confirmText?: string
  cancelText?: string
  danger?: boolean
  closeOnOverlayClick?: boolean
  onConfirm: () => void
  onCancel: () => void
  /** 额外的操作链接，显示在按钮左侧 */
  extraAction?: {
    text: string
    onClick: () => void
  }
}

/**
 * 确认对话框
 */
export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  title,
  message,
  confirmText,
  cancelText,
  danger = false,
  closeOnOverlayClick = true,
  onConfirm,
  onCancel,
  extraAction,
}) => {
  return (
    <DialogOverlay onClose={onCancel} closeOnOverlayClick={closeOnOverlayClick} ariaLabel={title}>
      <div className="gh-dialog-title">{title}</div>
      <div className="gh-dialog-message">{message}</div>
      <div
        className="gh-dialog-buttons"
        style={{ justifyContent: extraAction ? "space-between" : "flex-end" }}>
        {extraAction && (
          <button
            className="gh-dialog-btn"
            style={{
              background: "transparent",
              color: "var(--gh-primary, #4285f4)",
              padding: "8px 12px",
              textDecoration: "underline",
            }}
            onClick={extraAction.onClick}>
            ↗ {extraAction.text}
          </button>
        )}
        <div style={{ display: "flex", gap: "8px" }}>
          <button className="gh-dialog-btn gh-dialog-btn-secondary" onClick={onCancel}>
            {cancelText || t("cancel")}
          </button>
          <button
            className={`gh-dialog-btn ${danger ? "gh-dialog-btn-danger" : "gh-dialog-btn-primary"}`}
            onClick={onConfirm}>
            {confirmText || t("confirm")}
          </button>
        </div>
      </div>
    </DialogOverlay>
  )
}

// ==================== InputDialog ====================

export interface InputDialogProps {
  title: string
  defaultValue?: string
  placeholder?: string
  confirmText?: string
  cancelText?: string
  closeOnOverlayClick?: boolean
  onConfirm: (value: string) => void
  onCancel: () => void
}

/**
 * 输入对话框
 */
export const InputDialog: React.FC<InputDialogProps> = ({
  title,
  defaultValue = "",
  placeholder,
  confirmText,
  cancelText,
  closeOnOverlayClick = true,
  onConfirm,
  onCancel,
}) => {
  const [value, setValue] = useState(defaultValue)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
    inputRef.current?.select()
  }, [])

  const handleConfirm = () => {
    onConfirm(value)
  }

  return (
    <DialogOverlay onClose={onCancel} closeOnOverlayClick={closeOnOverlayClick} ariaLabel={title}>
      <div className="gh-dialog-title">{title}</div>
      <input
        ref={inputRef}
        type="text"
        className="gh-dialog-input"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={placeholder}
        onKeyDown={(e) => e.key === "Enter" && handleConfirm()}
      />
      <div className="gh-dialog-buttons">
        <button className="gh-dialog-btn gh-dialog-btn-secondary" onClick={onCancel}>
          {cancelText || t("cancel")}
        </button>
        <button className="gh-dialog-btn gh-dialog-btn-primary" onClick={handleConfirm}>
          {confirmText || t("confirm")}
        </button>
      </div>
    </DialogOverlay>
  )
}

export default { DialogOverlay, ConfirmDialog, InputDialog }
