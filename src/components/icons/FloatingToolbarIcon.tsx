/**
 * SVG 图标组件 - 浮动工具栏
 * 风格：Outline (stroke-based)
 */
import React from "react"

interface IconProps {
  size?: number
  color?: string
  className?: string
  style?: React.CSSProperties
}

export const FloatingToolbarIcon: React.FC<IconProps> = ({
  size = 18,
  color = "currentColor",
  className = "",
  style,
}) => (
  <svg
    viewBox="0 0 24 24"
    width={size}
    height={size}
    fill="none"
    stroke={color}
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    style={{ display: "block", ...style }}>
    <rect x="3" y="5" width="18" height="14" rx="3" />
    <path d="M3 9h18" />
    <circle cx="7" cy="7" r="1" fill={color} stroke="none" />
    <circle cx="12" cy="7" r="1" fill={color} stroke="none" />
    <circle cx="17" cy="7" r="1" fill={color} stroke="none" />
  </svg>
)

export default FloatingToolbarIcon
