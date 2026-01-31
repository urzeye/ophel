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
 */
import React, { useCallback, useEffect, useRef, useState } from "react"

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
  const commitValue = useCallback(() => {
    let val = parseInt(tempValue)

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
  }, [tempValue, min, max, defaultValue, value, onChange])

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
        commitValue()
      }
    }, 100)
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      commitValue()
      // 回车后失焦
      inputRef.current?.blur()
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

  return (
    <input
      ref={inputRef}
      type="text"
      inputMode="numeric"
      pattern="[0-9]*"
      className={className}
      value={tempValue}
      disabled={disabled}
      style={style}
      onChange={handleChange}
      onFocus={handleFocus}
      onBlur={handleBlur}
      onKeyDown={handleKeyDown}
    />
  )
}

export default NumberInput
