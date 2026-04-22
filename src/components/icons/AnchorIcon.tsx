/**
 * SVG 图标组件 - 锚点 (自动锚点)
 * 风格：Outline (stroke-based)
 * 设计：经典船锚形状，形象生动
 */
import React from "react"

interface IconProps {
  size?: number
  color?: string
  className?: string
}

export const AnchorIcon: React.FC<IconProps> = ({
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
    {/* 顶部圆环 */}
    <circle cx="12" cy="5" r="2.5" />
    {/* 主干竖线 */}
    <line x1="12" y1="7.5" x2="12" y2="22" />
    {/* 横杆 */}
    <line x1="7" y1="10" x2="17" y2="10" />
    {/* 底部弧线 */}
    <path d="M4 14C4 19 8 22 12 22C16 22 20 19 20 14" />
    {/* 箭头 - 左 */}
    <path d="M1.5 16.5L4 14L6.5 16.5" />
    {/* 箭头 - 右 */}
    <path d="M17.5 16.5L20 14L22.5 16.5" />
  </svg>
)

export default AnchorIcon
