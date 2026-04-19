import React, { useCallback, useEffect, useRef, useState } from "react"

import { RestoreIcon } from "~components/icons"
import { t } from "~utils/i18n"

export interface SliderProps {
  value: number
  onChange: (value: number) => void
  onPreviewChange?: (value: number) => void
  onCancelPreview?: () => void
  min: number
  max: number
  step?: number
  unit?: string
  defaultValue?: number
  disabled?: boolean
  style?: React.CSSProperties
  className?: string
  formatValue?: (value: number) => string
  ariaLabel?: string
}

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value))

export const Slider: React.FC<SliderProps> = ({
  value,
  onChange,
  onPreviewChange,
  onCancelPreview,
  min,
  max,
  step = 1,
  unit,
  defaultValue,
  disabled = false,
  style,
  className = "",
  formatValue,
  ariaLabel,
}) => {
  const safeValue = clamp(Number.isFinite(value) ? value : min, min, max)
  const [draftValue, setDraftValue] = useState(safeValue)
  const [isDragging, setIsDragging] = useState(false)
  const hasPendingCommitRef = useRef(false)
  const draftValueRef = useRef(safeValue)
  const cancelPreviewRef = useRef(onCancelPreview)

  useEffect(() => {
    cancelPreviewRef.current = onCancelPreview
  }, [onCancelPreview])

  useEffect(() => {
    draftValueRef.current = draftValue
  }, [draftValue])

  useEffect(
    () => () => {
      if (!hasPendingCommitRef.current) return

      hasPendingCommitRef.current = false
      cancelPreviewRef.current?.()
    },
    [],
  )

  useEffect(() => {
    if (!isDragging) {
      setDraftValue(safeValue)
      draftValueRef.current = safeValue
    }
  }, [safeValue, isDragging])

  const progress = max === min ? 0 : ((draftValue - min) / (max - min)) * 100
  const displayValue = formatValue ? formatValue(draftValue) : `${draftValue}${unit || ""}`
  const safeDefaultValue = defaultValue === undefined ? undefined : clamp(defaultValue, min, max)
  const isDefaultValue = safeDefaultValue !== undefined && draftValue === safeDefaultValue

  const commitValue = useCallback(
    (nextValue = draftValueRef.current) => {
      if (!hasPendingCommitRef.current || disabled) return
      hasPendingCommitRef.current = false
      onChange(clamp(nextValue, min, max))
    },
    [disabled, max, min, onChange],
  )

  useEffect(() => {
    if (!isDragging) return

    const handlePointerRelease = () => {
      setIsDragging(false)
      commitValue()
    }

    window.addEventListener("pointerup", handlePointerRelease)
    window.addEventListener("mouseup", handlePointerRelease)
    window.addEventListener("touchend", handlePointerRelease)

    return () => {
      window.removeEventListener("pointerup", handlePointerRelease)
      window.removeEventListener("mouseup", handlePointerRelease)
      window.removeEventListener("touchend", handlePointerRelease)
    }
  }, [commitValue, isDragging])

  const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const nextValue = clamp(Number.parseFloat(event.target.value), min, max)
    setDraftValue(nextValue)
    draftValueRef.current = nextValue
    hasPendingCommitRef.current = true
    onPreviewChange?.(nextValue)
  }

  const handleReset = () => {
    if (safeDefaultValue === undefined || disabled) return

    hasPendingCommitRef.current = false
    setDraftValue(safeDefaultValue)
    draftValueRef.current = safeDefaultValue
    onPreviewChange?.(safeDefaultValue)
    onChange(safeDefaultValue)
  }

  const handleKeyUp = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (
      [
        "ArrowLeft",
        "ArrowRight",
        "ArrowUp",
        "ArrowDown",
        "Home",
        "End",
        "PageUp",
        "PageDown",
      ].includes(event.key)
    ) {
      commitValue()
    }
  }

  return (
    <div
      className={`settings-slider ${disabled ? "disabled" : ""} ${className}`.trim()}
      style={
        {
          ...style,
          "--slider-progress": `${progress}%`,
        } as React.CSSProperties
      }>
      <div className="settings-slider-main">
        <div className="settings-slider-track">
          <input
            type="range"
            className="settings-slider-input"
            min={min}
            max={max}
            step={step}
            value={draftValue}
            onChange={handleChange}
            onPointerDown={() => setIsDragging(true)}
            onMouseDown={() => setIsDragging(true)}
            onTouchStart={() => setIsDragging(true)}
            onBlur={() => {
              setIsDragging(false)
              commitValue()
            }}
            onKeyUp={handleKeyUp}
            disabled={disabled}
            aria-label={ariaLabel}
            aria-valuemin={min}
            aria-valuemax={max}
            aria-valuenow={draftValue}
            aria-valuetext={displayValue}
          />
          <div className="settings-slider-boundary">
            <span>{formatValue ? formatValue(min) : `${min}${unit || ""}`}</span>
            <span>{formatValue ? formatValue(max) : `${max}${unit || ""}`}</span>
          </div>
        </div>
        <span className="settings-slider-value">{displayValue}</span>
        {safeDefaultValue !== undefined && (
          <button
            type="button"
            className="settings-slider-reset"
            onClick={handleReset}
            disabled={disabled || isDefaultValue}
            title={t("restore") || "恢复默认"}
            aria-label={t("restore") || "恢复默认"}>
            <RestoreIcon size={14} />
          </button>
        )}
      </div>
    </div>
  )
}

export default Slider
