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
    {/* Symmetrical Atom: 3 Orbits at 0, 60, 120 degrees */}
    <ellipse
      cx="12"
      cy="12"
      rx="10"
      ry="4"
      stroke="currentColor"
      strokeWidth="1.5"
      transform="rotate(0 12 12)"
    />
    <ellipse
      cx="12"
      cy="12"
      rx="10"
      ry="4"
      stroke="currentColor"
      strokeWidth="1.5"
      transform="rotate(60 12 12)"
    />
    <ellipse
      cx="12"
      cy="12"
      rx="10"
      ry="4"
      stroke="currentColor"
      strokeWidth="1.5"
      transform="rotate(120 12 12)"
    />
    {/* Nucleus */}
    <circle cx="12" cy="12" r="3" fill="currentColor" stroke="none" />
  </svg>
)

export default ToolsIcon
