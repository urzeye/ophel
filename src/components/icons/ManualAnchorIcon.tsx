/**
 * SVG 图标组件 - 手动锚点 (定位+添加)
 * 风格：Outline (stroke-based)
 * 设计：定位标记结合加号，表达"在此处添加锚点"
 */
import React from "react"

interface IconProps {
  size?: number
  color?: string
  className?: string
}

export const ManualAnchorIcon: React.FC<IconProps> = ({
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
    strokeWidth="1.5"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    style={{ display: "block" }}>
    {/* 定位标记主体 */}
    <path d="M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0" />
    {/* 居中大加号 */}
    <line x1="12" y1="7" x2="12" y2="13" />
    <line x1="9" y1="10" x2="15" y2="10" />
  </svg>
)

export default ManualAnchorIcon
