/**
 * SVG 图标组件 - 向下箭头
 * 风格：Outline (stroke-based)
 */
import React from "react"

interface IconProps {
  size?: number
  color?: string
  className?: string
  style?: React.CSSProperties
}

export const ChevronDownIcon: React.FC<IconProps> = ({
  size = 20,
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
    strokeWidth="3"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    style={{ display: "block", ...style }}>
    <path d="M6 9l6 6 6-6" />
  </svg>
)

export default ChevronDownIcon
