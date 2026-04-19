/**
 * SVG 图标组件 - 吸附到边缘（侧边栏吸附）
 * 风格：Outline (stroke-based)
 */
import React from "react"

interface IconProps {
  size?: number
  color?: string
  className?: string
}

export const SnapToEdgeIcon: React.FC<IconProps> = ({
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
    {/* 左侧边缘线 */}
    <line x1="3" y1="3" x2="3" y2="21" />
    {/* 面板矩形 */}
    <rect x="7" y="6" width="14" height="12" rx="2" />
    {/* 向左箭头（吸附方向） */}
    <polyline points="13 10 10 12 13 14" />
  </svg>
)

export default SnapToEdgeIcon
