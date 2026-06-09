/**
 * SVG 图标组件 - 展开全部 (列表 + 外扩箭头)
 * 风格：Outline (stroke-based)
 */
import React from "react"

interface IconProps {
  size?: number
  color?: string
  className?: string
}

export const ExpandAllIcon: React.FC<IconProps> = ({
  size = 18,
  color = "currentColor",
  className = "",
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
    style={{ display: "block" }}>
    <path d="M4 6h6" />
    <path d="M4 10h9" />
    <path d="M4 14h9" />
    <path d="M4 18h6" />
    <path d="M18 5v14" />
    <path d="m15.5 7.5 2.5-2.5 2.5 2.5" />
    <path d="m15.5 16.5 2.5 2.5 2.5-2.5" />
  </svg>
)

export default ExpandAllIcon
