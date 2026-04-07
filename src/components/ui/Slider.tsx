import React from "react"

export interface SliderProps {
  value: number
  onChange: (value: number) => void
  min: number
  max: number
  step?: number
  unit?: string
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
  min,
  max,
  step = 1,
  unit,
  disabled = false,
  style,
  className = "",
  formatValue,
  ariaLabel,
}) => {
  const safeValue = clamp(Number.isFinite(value) ? value : min, min, max)
  const progress = max === min ? 0 : ((safeValue - min) / (max - min)) * 100
  const displayValue = formatValue ? formatValue(safeValue) : `${safeValue}${unit || ""}`

  const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    onChange(Number.parseFloat(event.target.value))
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
        <input
          type="range"
          className="settings-slider-input"
          min={min}
          max={max}
          step={step}
          value={safeValue}
          onChange={handleChange}
          disabled={disabled}
          aria-label={ariaLabel}
          aria-valuemin={min}
          aria-valuemax={max}
          aria-valuenow={safeValue}
          aria-valuetext={displayValue}
        />
        <span className="settings-slider-value">{displayValue}</span>
      </div>

      <div className="settings-slider-boundary">
        <span>{formatValue ? formatValue(min) : `${min}${unit || ""}`}</span>
        <span>{formatValue ? formatValue(max) : `${max}${unit || ""}`}</span>
      </div>
    </div>
  )
}

export default Slider
