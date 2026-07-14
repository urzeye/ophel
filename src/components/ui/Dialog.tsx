import React, { useEffect, useId, useRef, useState } from "react"
import { createPortal } from "react-dom"

import {
  attachEditableKeyboardFocusGuard,
  OPHEL_HOVER_WIDTH_RETAIN_LAYER_PROPS,
} from "~utils/dom-toolkit"
import { t } from "~utils/i18n"
import { useOverlayPortalTarget } from "./OverlayPortal"

const getDeepActiveElement = (): HTMLElement | null => {
  let activeElement: Element | null = document.activeElement

  while (activeElement?.shadowRoot?.activeElement) {
    activeElement = activeElement.shadowRoot.activeElement
  }

  return activeElement instanceof HTMLElement ? activeElement : null
}

const dialogStack: symbol[] = []

const registerDialog = (token: symbol): void => {
  dialogStack.push(token)
}

const unregisterDialog = (token: symbol): void => {
  const index = dialogStack.lastIndexOf(token)
  if (index !== -1) dialogStack.splice(index, 1)
}

const isTopDialog = (token: symbol): boolean => dialogStack.at(-1) === token

// ==================== DialogOverlay ====================

export interface DialogOverlayProps {
  children: React.ReactNode
  onClose: () => void
  closeOnOverlayClick?: boolean
  closeOnEscape?: boolean
  overlayClassName?: string
  dialogClassName?: string
  dialogStyle?: React.CSSProperties
  ariaLabel?: string
}

/**
 * 对话框覆盖层 - 渲染到当前 React 树注册的统一覆盖层根节点
 */
export const DialogOverlay: React.FC<DialogOverlayProps> = ({
  children,
  onClose,
  closeOnOverlayClick = true,
  closeOnEscape = true,
  overlayClassName,
  dialogClassName,
  dialogStyle,
  ariaLabel,
}) => {
  const portalTarget = useOverlayPortalTarget()
  const overlayRef = useRef<HTMLDivElement>(null)
  const dialogRef = useRef<HTMLDivElement>(null)
  const restoreFocusRef = useRef<HTMLElement | null>(null)
  const dialogTokenRef = useRef(Symbol("dialog"))
  const onCloseRef = useRef(onClose)
  const closeOnEscapeRef = useRef(closeOnEscape)
  const titleId = `gh-dialog-title-${useId().replace(/:/g, "")}`
  const [resolvedTitleId, setResolvedTitleId] = useState<string | undefined>(undefined)

  onCloseRef.current = onClose
  closeOnEscapeRef.current = closeOnEscape

  useEffect(() => {
    if (!portalTarget) return

    const token = dialogTokenRef.current
    restoreFocusRef.current = getDeepActiveElement()
    registerDialog(token)

    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isTopDialog(token)) return

      if (closeOnEscapeRef.current && e.key === "Escape") {
        e.preventDefault()
        onCloseRef.current()
        return
      }

      if (e.key !== "Tab") return

      const dialog = dialogRef.current
      if (!dialog) return
      const focusable = Array.from(
        dialog.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((element) => element.getAttribute("aria-hidden") !== "true")

      if (focusable.length === 0) {
        e.preventDefault()
        dialog.focus()
        return
      }

      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      const activeElement = getDeepActiveElement()
      if (e.shiftKey && activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }
    document.addEventListener("keydown", handleKeyDown)
    return () => {
      document.removeEventListener("keydown", handleKeyDown)
      unregisterDialog(token)
      restoreFocusRef.current?.focus()
    }
  }, [portalTarget])

  useEffect(() => {
    if (!portalTarget) return

    const dialog = dialogRef.current
    if (!dialog) return

    const title = dialog.querySelector<HTMLElement>(".gh-dialog-title, .conversations-dialog-title")
    if (title) {
      title.id = titleId
      setResolvedTitleId(titleId)
    } else {
      setResolvedTitleId(undefined)
    }

    const initialFocus = dialog.querySelector<HTMLElement>(
      '[autofocus], input:not([disabled]), textarea:not([disabled]), select:not([disabled]), button:not([disabled]), [tabindex]:not([tabindex="-1"])',
    )
    ;(initialFocus || dialog).focus()
  }, [portalTarget, titleId])

  useEffect(() => {
    if (!portalTarget) return

    const overlay = overlayRef.current
    if (!overlay) {
      return
    }

    // 通用弹窗内部广泛依赖本地 onKeyDown 逻辑，这里使用冒泡阶段拦截，避免吞掉确认/关闭等键盘行为。
    return attachEditableKeyboardFocusGuard(overlay, { capture: false })
  }, [portalTarget])

  const dialogContent = (
    <div
      ref={overlayRef}
      className={`gh-dialog-overlay gh-interactive${overlayClassName ? ` ${overlayClassName}` : ""}`}
      {...OPHEL_HOVER_WIDTH_RETAIN_LAYER_PROPS}
      onClick={
        closeOnOverlayClick
          ? (event) => {
              if (event.target === event.currentTarget && isTopDialog(dialogTokenRef.current)) {
                onClose()
              }
            }
          : undefined
      }>
      <div
        ref={dialogRef}
        className={dialogClassName ? `gh-dialog ${dialogClassName}` : "gh-dialog"}
        style={dialogStyle}
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel}
        aria-labelledby={ariaLabel ? undefined : resolvedTitleId}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}>
        {children}
      </div>
    </div>
  )

  return portalTarget ? createPortal(dialogContent, portalTarget) : null
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
    <DialogOverlay onClose={onCancel} closeOnOverlayClick={closeOnOverlayClick}>
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
    <DialogOverlay onClose={onCancel} closeOnOverlayClick={closeOnOverlayClick}>
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
