/**
 * Switch 开关组件
 */
import React from "react"

export interface SwitchProps {
  checked: boolean
  onChange: (checked: boolean) => void
  disabled?: boolean
  ariaLabel?: string
  /** 尺寸: sm=32x18, md=36x20 */
  size?: "sm" | "md"
  /** 当外层已被 <label> 包裹时传 "span"，避免非法的嵌套 <label> */
  renderAs?: "label" | "span"
}

/**
 * 通用开关组件
 * 使用 CSS 变量支持主题跟随
 */
export const Switch: React.FC<SwitchProps> = ({
  checked,
  onChange,
  disabled = false,
  ariaLabel,
  size = "md",
  renderAs = "label",
}) => {
  // 尺寸配置
  const dimensions = size === "sm" ? { w: 32, h: 18, thumb: 14 } : { w: 36, h: 20, thumb: 16 }
  const Wrapper = renderAs

  return (
    <Wrapper
      className="gh-switch"
      style={{
        position: "relative",
        display: "inline-block",
        width: `${dimensions.w}px`,
        height: `${dimensions.h}px`,
        flexShrink: 0,
      }}>
      <input
        className="gh-switch-input"
        type="checkbox"
        role="switch"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        disabled={disabled}
        aria-label={ariaLabel}
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          margin: 0,
          opacity: 0,
          cursor: disabled ? "not-allowed" : "inherit",
        }}
      />
      <span
        className="gh-switch-track"
        aria-hidden="true"
        style={{
          position: "absolute",
          cursor: disabled ? "not-allowed" : "pointer",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: checked
            ? "var(--gh-primary, #4285f4)"
            : "color-mix(in srgb, var(--gh-text-secondary, #6b7280) 32%, transparent)",
          borderRadius: `${dimensions.h}px`,
          transition: "background-color 0.2s ease",
        }}>
        <span
          className="gh-switch-thumb"
          style={{
            position: "absolute",
            height: `${dimensions.thumb}px`,
            width: `${dimensions.thumb}px`,
            left: checked ? `${dimensions.w - dimensions.thumb - 2}px` : "2px",
            bottom: `${(dimensions.h - dimensions.thumb) / 2}px`,
            backgroundColor: checked
              ? "var(--gh-text-on-primary, #ffffff)"
              : "var(--gh-bg, #ffffff)",
            borderRadius: "50%",
            boxShadow: "0 1px 2px rgba(0, 0, 0, 0.18)",
            transition: "left 0.2s cubic-bezier(0.2, 0.8, 0.2, 1), background-color 0.2s ease",
          }}
        />
      </span>
    </Wrapper>
  )
}

export default Switch
