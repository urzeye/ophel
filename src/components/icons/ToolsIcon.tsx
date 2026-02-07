/**
 * SVG 图标组件 - 工具箱/应用菜单
 * 风格：Outline (stroke-based)
 * 图形：2x2 圆角方块矩阵
 */
import React from "react"

interface IconProps {
  size?: number
  color?: string
  className?: string
}

export const ToolsIcon: React.FC<IconProps> = ({
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
    <rect x="3" y="3" width="7" height="7" rx="2" ry="2" />
    <rect x="14" y="3" width="7" height="7" rx="2" ry="2" />
    <rect x="14" y="14" width="7" height="7" rx="2" ry="2" />
    <rect x="3" y="14" width="7" height="7" rx="2" ry="2" />
  </svg>
)

export default ToolsIcon
