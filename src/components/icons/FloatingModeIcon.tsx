/**
 * SVG 图标组件 - 悬浮模式（自由拖拽面板）
 * 风格：Outline (stroke-based)
 */
import React from "react"

interface IconProps {
  size?: number
  color?: string
  className?: string
}

export const FloatingModeIcon: React.FC<IconProps> = ({
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
    {/* 面板矩形 */}
    <rect x="3" y="3" width="18" height="18" rx="2" />
    {/* 四向移动箭头（自由拖拽） */}
    <line x1="12" y1="8" x2="12" y2="16" />
    <line x1="8" y1="12" x2="16" y2="12" />
    <polyline points="10 9.5 12 8 14 9.5" />
    <polyline points="14 14.5 12 16 10 14.5" />
  </svg>
)

export default FloatingModeIcon
