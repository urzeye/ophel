/**
 * SVG 图标组件 - 滚动到底部
 * 风格：Outline (stroke-based)，与 SIDEBAR_ICONS 保持一致
 */
import React from "react"

interface IconProps {
  size?: number
  color?: string
  className?: string
}

export const ScrollBottomIcon: React.FC<IconProps> = ({
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
    {/* 向下箭头 */}
    <line x1="12" y1="5" x2="12" y2="19" />
    <polyline points="19 12 12 19 5 12" />
  </svg>
)

export default ScrollBottomIcon
