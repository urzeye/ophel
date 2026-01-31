/**
 * NumberInput 数字输入组件
 *
 * 解决的问题：防止 Store 同步覆盖用户正在输入的值
 *
 * 核心逻辑：
 * 1. 内部维护 tempValue 临时状态
 * 2. 用户输入时只更新 tempValue
 * 3. 只有当输入框没有焦点时，才从外部 value 同步到 tempValue
 * 4. 失焦后使用防抖延迟验证，避免瞬时失焦（如 React 重渲染）导致的问题
 * 5. 支持上下箭头按钮和键盘调节
 */
import React, { useCallback, useEffect, useRef, useState } from "react"

import { ChevronDownIcon, ChevronUpIcon } from "~components/icons"

export interface NumberInputProps {
  /** 当前值（来自 Store） */
  value: number
  /** 值变化回调（失焦或回车时触发） */
  onChange: (value: number) => void
  /** 最小值 */
  min?: number
  /** 最大值 */
  max?: number
  /** 无效输入时的默认值 */
  defaultValue?: number
  /** 是否禁用 */
  disabled?: boolean
  /** 自定义样式 */
  style?: React.CSSProperties
  /** 自定义类名 */
  className?: string
  /** 步长，默认 1 */
  step?: number
}

/**
 * 数字输入组件
 * 只在失焦或按下回车时才提交更改，防止输入过程中被 Store 同步覆盖
 */
export const NumberInput: React.FC<NumberInputProps> = ({
  value,
  onChange,
  min,
  max,
  defaultValue,
  disabled = false,
  style,
  className = "settings-input",
  step = 1,
}) => {
  // 临时输入值（字符串，支持用户输入中间状态如空字符串）
  const [tempValue, setTempValue] = useState(value.toString())
  // 是否正在编辑（有焦点）
  const isFocusedRef = useRef(false)
  // 防抖定时器
  const blurTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // 输入框引用
  const inputRef = useRef<HTMLInputElement>(null)

  // 只有当输入框没有焦点时，才从外部 value 同步到 tempValue
  useEffect(() => {
    if (!isFocusedRef.current) {
      setTempValue(value.toString())
    }
  }, [value])

  // 验证并提交值
  const commitValue = useCallback(
    (inputValue: string) => {
      let val = parseInt(inputValue)

      // 无效输入时使用默认值
      if (isNaN(val)) {
        val = defaultValue ?? value ?? 0
      }

      // Clamp 到 min/max 范围
      if (min !== undefined && val < min) val = min
      if (max !== undefined && val > max) val = max

      // 更新临时值为 clamp 后的值
      setTempValue(val.toString())

      // 只有值发生变化时才触发 onChange
      if (val !== value) {
        onChange(val)
      }
    },
    [min, max, defaultValue, value, onChange],
  )

  const handleStep = useCallback(
    (delta: number) => {
      if (disabled) return

      let currentVal = parseInt(tempValue)
      if (isNaN(currentVal)) {
        currentVal = defaultValue ?? value ?? 0
      }

      const newVal = currentVal + delta
      commitValue(newVal.toString())
    },
    [tempValue, defaultValue, value, disabled, commitValue],
  )

  const handleFocus = () => {
    // 清除任何待执行的 blur 定时器
    if (blurTimerRef.current) {
      clearTimeout(blurTimerRef.current)
      blurTimerRef.current = null
    }
    isFocusedRef.current = true
  }

  const handleBlur = () => {
    // 使用防抖：延迟 100ms 执行，给 React 重渲染后恢复焦点的机会
    blurTimerRef.current = setTimeout(() => {
      // 再次检查是否真的失焦了（可能已经重新获得焦点）
      if (document.activeElement !== inputRef.current) {
        isFocusedRef.current = false
        commitValue(tempValue)
      }
    }, 100)
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      commitValue(tempValue)
      // 回车后失焦
      inputRef.current?.blur()
    } else if (e.key === "ArrowUp") {
      e.preventDefault()
      handleStep(step)
    } else if (e.key === "ArrowDown") {
      e.preventDefault()
      handleStep(-step)
    }
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    // 只允许数字和负号
    const filtered = e.target.value.replace(/[^0-9-]/g, "")
    setTempValue(filtered)
  }

  // 清理定时器
  useEffect(() => {
    return () => {
      if (blurTimerRef.current) {
        clearTimeout(blurTimerRef.current)
      }
    }
  }, [])

  // 悬浮状态
  const [isHovered, setIsHovered] = useState(false)

  return (
    <div
      className={className}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      style={{
        ...style,
        position: "relative",
        display: "inline-flex",
        alignItems: "center",
      }}>
      <input
        ref={inputRef}
        type="text"
        inputMode="numeric"
        pattern="[0-9]*"
        style={{
          width: "100%",
          paddingRight: "20px", // 给按钮留位置
          height: "100%",
          border: "none",
          background: "transparent",
          outline: "none",
          color: "inherit",
          fontSize: "inherit",
          fontFamily: "inherit",
          paddingLeft: "8px",
          textAlign: "left", // 确保左对齐
        }}
        value={tempValue}
        disabled={disabled}
        onChange={handleChange}
        onFocus={handleFocus}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
      />

      {/* 步进按钮容器 */}
      {!disabled && (
        <div
          style={{
            position: "absolute",
            right: "2px",
            top: "2px",
            bottom: "2px",
            display: "flex",
            flexDirection: "column",
            width: "16px",
            // 去掉边框和背景，更清爽
            background: "transparent",
            opacity: isHovered ? 1 : 0.2, // 悬浮时显示
            transition: "opacity 0.2s ease",
            pointerEvents: isHovered ? "auto" : "none", // 隐藏时不阻挡点击
          }}>
          <button
            type="button"
            tabIndex={-1}
            onClick={(e) => {
              e.preventDefault()
              handleStep(step)
            }}
            style={{
              flex: 1,
              border: "none",
              background: "var(--gh-hover, #f3f4f6)",
              borderRadius: "3px 3px 0 0",
              cursor: "pointer",
              padding: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "var(--gh-text-secondary, #6b7280)",
              marginBottom: "1px",
            }}>
            <ChevronUpIcon size={8} />
          </button>
          <button
            type="button"
            tabIndex={-1}
            onClick={(e) => {
              e.preventDefault()
              handleStep(-step)
            }}
            style={{
              flex: 1,
              border: "none",
              background: "var(--gh-hover, #f3f4f6)",
              borderRadius: "0 0 3px 3px",
              cursor: "pointer",
              padding: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "var(--gh-text-secondary, #6b7280)",
            }}>
            <ChevronDownIcon size={8} />
          </button>
        </div>
      )}
    </div>
  )
}

export default NumberInput
