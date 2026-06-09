/**
 * SVG 图标组件 - 折叠全部 (列表 + 内收箭头)
 * 风格：Outline (stroke-based)
 */
import React from "react"

interface IconProps {
  size?: number
  color?: string
  className?: string
}

export const CollapseAllIcon: React.FC<IconProps> = ({
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
    <path d="M4 6h9" />
    <path d="M4 12h9" />
    <path d="M4 18h9" />
    <path d="M18 3v6" />
    <path d="m15.5 6.5 2.5 2.5 2.5-2.5" />
    <path d="M18 21v-6" />
    <path d="m15.5 17.5 2.5-2.5 2.5 2.5" />
  </svg>
)

export default CollapseAllIcon
