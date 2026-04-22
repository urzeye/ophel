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
    style={{ display: "block", width: size, height: size }}>
    {/* 左侧边缘线 */}
    <line x1="2" y1="2" x2="2" y2="22" />
    {/* 面板矩形 */}
    <rect x="6" y="4" width="16" height="16" rx="2" />
    {/* 向左箭头（吸附方向） */}
    <polyline points="15 9 11 12 15 15" />
  </svg>
)

export default SnapToEdgeIcon
