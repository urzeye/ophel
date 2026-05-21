/**
 * PlaceholderInput — 可点击插入占位符的文本输入组件
 *
 * 使用原生 input 保持稳定的光标、长按输入与删除行为；占位符通过按钮插入到当前光标位置。
 * onChange 输出纯文本字符串，与 titleFormat 等模板类设置兼容。
 */
import React, { useCallback, useEffect, useRef } from "react"

export interface PlaceholderInputProps {
  value: string
  onChange: (value: string) => void
  placeholders: string[]
  placeholder?: string
  className?: string
  style?: React.CSSProperties
  disabled?: boolean
}

interface SelectionState {
  start: number
  end: number
}

function createPlaceholderPattern(placeholders: string[]): RegExp | null {
  const escapedPlaceholders = placeholders
    .filter(Boolean)
    .map((token) => token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))

  if (escapedPlaceholders.length === 0) return null
  return new RegExp(`(${escapedPlaceholders.join("|")})`, "g")
}

function renderHighlightedValue(value: string, placeholders: string[]): React.ReactNode {
  if (!value) return null

  const pattern = createPlaceholderPattern(placeholders)
  if (!pattern) return value

  const nodes: React.ReactNode[] = []
  let lastIndex = 0
  let match: RegExpExecArray | null

  while ((match = pattern.exec(value)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(value.slice(lastIndex, match.index))
    }

    nodes.push(
      <span key={`${match[0]}-${match.index}`} className="placeholder-input-chip">
        {match[0]}
      </span>,
    )
    lastIndex = pattern.lastIndex
  }

  if (lastIndex < value.length) {
    nodes.push(value.slice(lastIndex))
  }

  return nodes
}

export const PlaceholderInput: React.FC<PlaceholderInputProps> = ({
  value,
  onChange,
  placeholders,
  placeholder,
  className,
  style,
  disabled,
}) => {
  const inputRef = useRef<HTMLInputElement>(null)
  const mirrorRef = useRef<HTMLSpanElement>(null)
  const valueRef = useRef(value)
  const selectionRef = useRef<SelectionState>({ start: value.length, end: value.length })

  useEffect(() => {
    valueRef.current = value
    const maxOffset = value.length
    selectionRef.current = {
      start: Math.min(selectionRef.current.start, maxOffset),
      end: Math.min(selectionRef.current.end, maxOffset),
    }
  }, [value])

  const saveSelection = useCallback(() => {
    const input = inputRef.current
    if (!input) return

    const start = input.selectionStart ?? valueRef.current.length
    const end = input.selectionEnd ?? start
    selectionRef.current = { start, end }
  }, [])

  const restoreSelection = useCallback((offset: number) => {
    const input = inputRef.current
    if (!input) return

    input.focus()
    input.setSelectionRange(offset, offset)
    selectionRef.current = { start: offset, end: offset }
  }, [])

  const syncMirrorScroll = useCallback(() => {
    const input = inputRef.current
    const mirror = mirrorRef.current
    if (!input || !mirror) return

    mirror.style.transform = `translateX(-${input.scrollLeft}px)`
  }, [])

  useEffect(() => {
    syncMirrorScroll()
  }, [syncMirrorScroll, value])

  const handleChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      valueRef.current = event.target.value
      onChange(event.target.value)
      saveSelection()
      requestAnimationFrame(syncMirrorScroll)
    },
    [onChange, saveSelection, syncMirrorScroll],
  )

  const insertPlaceholder = useCallback(
    (token: string) => {
      if (disabled) return

      const input = inputRef.current
      const currentValue = valueRef.current
      const start = input?.selectionStart ?? selectionRef.current.start
      const end = input?.selectionEnd ?? selectionRef.current.end
      const nextValue = `${currentValue.slice(0, start)}${token}${currentValue.slice(end)}`
      const nextOffset = start + token.length

      valueRef.current = nextValue
      onChange(nextValue)
      requestAnimationFrame(() => {
        restoreSelection(nextOffset)
        syncMirrorScroll()
      })
    },
    [disabled, onChange, restoreSelection, syncMirrorScroll],
  )

  const mergedClassName = ["placeholder-input-native", className].filter(Boolean).join(" ")

  return (
    <div
      className={`placeholder-input-field ${disabled ? "placeholder-input-disabled" : ""}`}
      style={style}>
      <div className="placeholder-input-surface">
        <div className="placeholder-input-mirror" aria-hidden="true">
          <span ref={mirrorRef} className="placeholder-input-mirror-scroll">
            {renderHighlightedValue(value, placeholders)}
          </span>
        </div>

        <input
          ref={inputRef}
          type="text"
          dir="ltr"
          className={mergedClassName}
          value={value}
          onChange={handleChange}
          onSelect={saveSelection}
          onClick={saveSelection}
          onKeyUp={saveSelection}
          onScroll={syncMirrorScroll}
          placeholder={placeholder}
          disabled={disabled}
        />
      </div>

      <div className="placeholder-input-list" aria-label="Title format placeholders">
        {placeholders.map((token) => (
          <button
            key={token}
            type="button"
            className="placeholder-input-button"
            disabled={disabled}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => insertPlaceholder(token)}
            title={token}>
            {token}
          </button>
        ))}
      </div>
    </div>
  )
}

export default PlaceholderInput
