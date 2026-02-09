/**
 * 变量输入弹窗组件
 *
 * 用于提示词中的变量占位符 {{varName}} 填写
 */

import React, { useEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"

import { ClearIcon } from "~components/icons"
import { t } from "~utils/i18n"

interface Variable {
  name: string
  value: string
}

interface VariableInputDialogProps {
  variables: string[] // 变量名列表
  onConfirm: (values: Record<string, string>) => void
  onCancel: () => void
}

export const VariableInputDialog: React.FC<VariableInputDialogProps> = ({
  variables,
  onConfirm,
  onCancel,
}) => {
  const [values, setValues] = useState<Variable[]>(variables.map((name) => ({ name, value: "" })))
  const firstInputRef = useRef<HTMLInputElement>(null)

  // 自动聚焦第一个输入框
  useEffect(() => {
    setTimeout(() => {
      firstInputRef.current?.focus()
    }, 100)
  }, [])

  const handleSubmit = () => {
    const result: Record<string, string> = {}
    values.forEach((v) => {
      result[v.name] = v.value
    })
    onConfirm(result)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      handleSubmit()
    }
    if (e.key === "Escape") {
      onCancel()
    }
  }

  const updateValue = (index: number, value: string) => {
    setValues((prev) => {
      const next = [...prev]
      next[index] = { ...next[index], value }
      return next
    })
  }

  return createPortal(
    <div
      className="prompt-modal"
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: "rgba(0, 0, 0, 0.5)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 10000,
      }}
      onClick={onCancel}>
      <div
        className="prompt-modal-content"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
        style={{
          background: "var(--gh-bg, white)",
          borderRadius: "12px",
          width: "400px",
          maxWidth: "90%",
          maxHeight: "80vh",
          display: "flex",
          flexDirection: "column",
          boxShadow: "0 4px 20px rgba(0,0,0,0.2)",
          animation: "slideUp 0.2s ease-out",
        }}>
        {/* 标题 */}
        <div
          style={{
            padding: "16px",
            borderBottom: "1px solid var(--gh-border, #e5e7eb)",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}>
          <h3
            style={{
              margin: 0,
              fontSize: "16px",
              fontWeight: 600,
              color: "var(--gh-text, #374151)",
            }}>
            {t("promptVariableTitle") || "填写变量"}
          </h3>
          <button
            onClick={onCancel}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              fontSize: "18px",
              color: "var(--gh-text-secondary, #9ca3af)",
            }}>
            <ClearIcon size={18} />
          </button>
        </div>

        {/* 变量输入区域 */}
        <div style={{ padding: "16px", overflowY: "auto", flex: 1 }}>
          {values.map((variable, index) => (
            <div
              key={variable.name}
              style={{
                marginBottom: "16px",
                display: "flex",
                flexDirection: "column",
                gap: "6px",
              }}>
              <label
                style={{
                  fontSize: "14px",
                  fontWeight: 500,
                  color: "var(--gh-text, #374151)",
                  wordBreak: "break-all",
                }}>
                {variable.name}
              </label>
              <input
                ref={index === 0 ? firstInputRef : undefined}
                type="text"
                value={variable.value}
                onChange={(e) => updateValue(index, e.target.value)}
                placeholder={t("promptVariablePlaceholder") || "请输入"}
                style={{
                  width: "100%",
                  padding: "8px 12px",
                  borderRadius: "6px",
                  border: "1px solid var(--gh-input-border, #d1d5db)",
                  fontSize: "14px",
                  outline: "none",
                  background: "var(--gh-input-bg, white)",
                  color: "var(--gh-text, #374151)",
                  boxSizing: "border-box",
                  transition: "border-color 0.2s, box-shadow 0.2s",
                }}
                onFocus={(e) => {
                  e.target.style.borderColor = "var(--gh-primary, #4285f4)"
                  e.target.style.boxShadow = "0 0 0 2px rgba(66, 133, 244, 0.1)"
                }}
                onBlur={(e) => {
                  e.target.style.borderColor = "var(--gh-input-border, #d1d5db)"
                  e.target.style.boxShadow = "none"
                }}
              />
            </div>
          ))}
        </div>

        {/* 底部按钮 */}
        <div
          style={{
            padding: "12px 16px",
            borderTop: "1px solid var(--gh-border, #e5e7eb)",
            display: "flex",
            justifyContent: "flex-end",
            gap: "8px",
          }}>
          <button
            onClick={onCancel}
            style={{
              padding: "8px 16px",
              borderRadius: "6px",
              border: "1px solid var(--gh-border, #d1d5db)",
              background: "var(--gh-bg, white)",
              color: "var(--gh-text, #374151)",
              fontSize: "14px",
              cursor: "pointer",
            }}>
            {t("cancel") || "取消"}
          </button>
          <button
            onClick={handleSubmit}
            style={{
              padding: "8px 16px",
              borderRadius: "6px",
              border: "none",
              background: "var(--gh-primary, #4285f4)",
              color: "white",
              fontSize: "14px",
              cursor: "pointer",
              fontWeight: 500,
            }}>
            {t("confirm") || "确认"}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}

// ==================== 工具函数 ====================

/**
 * 提取提示词中的变量名
 * @param content 提示词内容
 * @returns 变量名数组（去重）
 */
export const extractVariables = (content: string): string[] => {
  const regex = /\{\{(\w+)\}\}/g
  const variables = new Set<string>()
  let match
  while ((match = regex.exec(content)) !== null) {
    variables.add(match[1])
  }
  return Array.from(variables)
}

/**
 * 替换提示词中的变量
 * @param content 原始内容
 * @param values 变量值映射
 * @returns 替换后的内容
 */
export const replaceVariables = (content: string, values: Record<string, string>): string => {
  return content.replace(/\{\{(\w+)\}\}/g, (_, name) => values[name] || `{{${name}}}`)
}
