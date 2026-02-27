/**
 * 变量输入弹窗组件
 *
 * 用于提示词中的变量占位符填写
 * 支持三种语法：
 * - {{变量}}        基础变量（文本输入）
 * - {{变量:默认值}}  带默认值（文本输入，预填默认值）
 * - {{变量:选项1|选项2}}  下拉选择
 */

import React, { useEffect, useRef, useState } from "react"

import { ClearIcon } from "~components/icons"
import { DialogOverlay } from "~components/ui"
import { t } from "~utils/i18n"

// ==================== 类型定义 ====================

/**
 * 解析后的变量结构
 */
export interface ParsedVariable {
  raw: string // 原始占位符内文本，如 "语言:中文" 或 "风格:正式|轻松|幽默"
  name: string // 变量名，如 "语言"、"风格"
  defaultValue?: string // 默认值，如 "中文"
  options?: string[] // 下拉选项，如 ["正式", "轻松", "幽默"]
}

interface Variable {
  name: string
  value: string
}

interface VariableInputDialogProps {
  variables: ParsedVariable[] // 解析后的变量列表
  onConfirm: (values: Record<string, string>) => void
  onCancel: () => void
}

export const VariableInputDialog: React.FC<VariableInputDialogProps> = ({
  variables,
  onConfirm,
  onCancel,
}) => {
  const [values, setValues] = useState<Variable[]>(
    variables.map((v) => ({
      name: v.raw,
      value: v.options ? v.options[0] : v.defaultValue ?? "",
    })),
  )
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
      e.preventDefault()
      e.stopPropagation()
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

  return (
    <DialogOverlay
      onClose={onCancel}
      closeOnOverlayClick={false}
      dialogClassName="prompt-modal-content"
      dialogStyle={{
        width: "400px",
        maxWidth: "90%",
        maxHeight: "80vh",
        display: "flex",
        flexDirection: "column",
        boxShadow: "0 4px 20px rgba(0,0,0,0.2)",
        animation: "slideUp 0.2s ease-out",
        padding: 0,
      }}>
      <div
        onKeyDown={handleKeyDown}
        style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>
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
          {variables.map((parsedVar, index) => (
            <div
              key={parsedVar.raw}
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
                {parsedVar.name}
              </label>
              {parsedVar.options ? (
                /* 下拉选择 */
                <select
                  value={values[index]?.value ?? ""}
                  onChange={(e) => updateValue(index, e.target.value)}
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
                    cursor: "pointer",
                    transition: "border-color 0.2s, box-shadow 0.2s",
                  }}
                  onFocus={(e) => {
                    e.target.style.borderColor = "var(--gh-primary, #4285f4)"
                    e.target.style.boxShadow = "0 0 0 2px rgba(66, 133, 244, 0.1)"
                  }}
                  onBlur={(e) => {
                    e.target.style.borderColor = "var(--gh-input-border, #d1d5db)"
                    e.target.style.boxShadow = "none"
                  }}>
                  {parsedVar.options.map((opt) => (
                    <option key={opt} value={opt}>
                      {opt}
                    </option>
                  ))}
                </select>
              ) : (
                /* 普通文本输入 */
                <input
                  ref={index === 0 ? firstInputRef : undefined}
                  type="text"
                  value={values[index]?.value ?? ""}
                  onChange={(e) => updateValue(index, e.target.value)}
                  placeholder={
                    parsedVar.defaultValue
                      ? `${t("promptVariablePlaceholder") || "请输入"} (${t("default") || "默认"}: ${parsedVar.defaultValue})`
                      : t("promptVariablePlaceholder") || "请输入"
                  }
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
              )}
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
    </DialogOverlay>
  )
}

// ==================== 工具函数 ====================

/**
 * 解析变量占位符内的文本
 *
 * - "主题"           → { raw: "主题", name: "主题" }
 * - "语言:中文"       → { raw: "语言:中文", name: "语言", defaultValue: "中文" }
 * - "风格:正式|轻松|幽默" → { raw: "风格:正式|轻松|幽默", name: "风格", options: ["正式", "轻松", "幽默"] }
 */
export const parseVariable = (raw: string): ParsedVariable => {
  const colonIndex = raw.indexOf(":")
  if (colonIndex === -1) {
    return { raw, name: raw }
  }

  const name = raw.substring(0, colonIndex)
  const rest = raw.substring(colonIndex + 1)

  // 含 "|" 则为选项列表，否则为默认值
  if (rest.includes("|")) {
    const options = rest.split("|").filter((o) => o.length > 0)
    return { raw, name, options }
  }

  return { raw, name, defaultValue: rest }
}

/**
 * 提取提示词中的变量（解析后）
 * @param content 提示词内容
 * @returns 解析后的变量数组（按 name 去重）
 */
export const extractVariables = (content: string): ParsedVariable[] => {
  const regex = /\{\{([^\s{}]+)\}\}/g
  const seen = new Set<string>()
  const variables: ParsedVariable[] = []
  let match
  while ((match = regex.exec(content)) !== null) {
    const raw = match[1]
    if (!seen.has(raw)) {
      seen.add(raw)
      variables.push(parseVariable(raw))
    }
  }
  return variables
}

/**
 * 替换提示词中的变量
 * @param content 原始内容
 * @param values 变量值映射（key 为 raw 字段）
 * @returns 替换后的内容
 */
export const replaceVariables = (content: string, values: Record<string, string>): string => {
  return content.replace(/\{\{([^\s{}]+)\}\}/g, (fullMatch, raw) => {
    if (raw in values) {
      return values[raw]
    }
    return fullMatch
  })
}
