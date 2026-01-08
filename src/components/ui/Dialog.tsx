/**
 * Dialog 对话框组件
 */
import React, { useEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"

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
  }
  .gh-dialog-buttons {
    display: flex;
    gap: 8px;
    justify-content: flex-end;
  }
  .gh-dialog-btn {
    padding: 8px 16px;
    border-radius: 6px;
    font-size: 14px;
    cursor: pointer;
    transition: all 0.2s;
    border: none;
  }
  .gh-dialog-btn-secondary {
    border: 1px solid var(--gh-border, #d1d5db);
    background: var(--gh-bg, white);
    color: var(--gh-text, #374151);
  }
  .gh-dialog-btn-secondary:hover {
    background: var(--gh-hover, #f3f4f6);
  }
  .gh-dialog-btn-primary {
    background: var(--gh-brand-gradient, linear-gradient(135deg, #4285f4 0%, #34a853 100%));
    color: white;
  }
  .gh-dialog-btn-danger {
    background: var(--gh-text-danger, #ef4444);
    color: white;
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
}

/**
 * 对话框覆盖层 - 使用 Portal 渲染到 document.body
 */
export const DialogOverlay: React.FC<DialogOverlayProps> = ({ children, onClose }) => {
  useEffect(() => {
    injectDialogStyles()

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
    }
    document.addEventListener("keydown", handleKeyDown)
    return () => document.removeEventListener("keydown", handleKeyDown)
  }, [onClose])

  const dialogContent = (
    <div className="gh-dialog-overlay gh-interactive" onClick={onClose}>
      <div className="gh-dialog" onClick={(e) => e.stopPropagation()}>
        {children}
      </div>
    </div>
  )

  return createPortal(dialogContent, document.body)
}

// ==================== ConfirmDialog ====================

export interface ConfirmDialogProps {
  title: string
  message: string
  confirmText?: string
  cancelText?: string
  danger?: boolean
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
  onConfirm,
  onCancel,
  extraAction,
}) => {
  return (
    <DialogOverlay onClose={onCancel}>
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
            {cancelText || t("cancel") || "取消"}
          </button>
          <button
            className={`gh-dialog-btn ${danger ? "gh-dialog-btn-danger" : "gh-dialog-btn-primary"}`}
            onClick={onConfirm}>
            {confirmText || t("confirm") || "确定"}
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
    <DialogOverlay onClose={onCancel}>
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
          {cancelText || t("cancel") || "取消"}
        </button>
        <button className="gh-dialog-btn gh-dialog-btn-primary" onClick={handleConfirm}>
          {confirmText || t("confirm") || "确定"}
        </button>
      </div>
    </DialogOverlay>
  )
}

export default { DialogOverlay, ConfirmDialog, InputDialog }
