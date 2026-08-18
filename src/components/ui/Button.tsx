/**
 * Button 按钮组件
 * 统一按钮样式，支持多种变体
 */
import React from "react"

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /** 变体: primary=渐变, secondary=边框, danger=红色, ghost=透明 */
  variant?: "primary" | "secondary" | "danger" | "ghost"
  /** 尺寸: sm=小, md=中 */
  size?: "sm" | "md"
}

/**
 * 通用按钮组件
 */
export const Button: React.FC<ButtonProps> = ({
  variant = "secondary",
  size = "md",
  style,
  children,
  ...props
}) => {
  // 尺寸配置
  const sizeStyles =
    size === "sm"
      ? { padding: "4px 8px", fontSize: "12px" }
      : { padding: "8px 16px", fontSize: "14px" }

  // 变体样式
  const variantStyles: Record<string, React.CSSProperties> = {
    primary: {
      background: "var(--gh-primary, #4285f4)",
      color: "var(--gh-text-on-primary, #ffffff)",
      border: "none",
    },
    secondary: {
      background: "var(--gh-card-bg, var(--gh-bg, #ffffff))",
      color: "var(--gh-text, #374151)",
      border: "1px solid var(--gh-border, #d1d5db)",
    },
    danger: {
      background: "var(--gh-danger, #ef4444)",
      color: "var(--gh-text-on-primary, #ffffff)",
      border: "none",
    },
    ghost: {
      background: "transparent",
      color: "var(--gh-text-secondary, #6b7280)",
      border: "none",
    },
  }

  return (
    <button
      {...props}
      style={{
        borderRadius: "6px",
        cursor: props.disabled ? "not-allowed" : "pointer",
        transition: "all 0.2s",
        fontWeight: 500,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        gap: "4px",
        opacity: props.disabled ? 0.5 : 1,
        ...sizeStyles,
        ...variantStyles[variant],
        ...style,
      }}>
      {children}
    </button>
  )
}

export default Button
