/**
 * SVG 图标组件 - 星星 (收藏/评分)
 * 风格：Fill-based
 */
import React from "react"

interface IconProps {
  size?: number
  color?: string
  className?: string
  style?: React.CSSProperties
}

export const StarIcon: React.FC<IconProps & { filled?: boolean }> = ({
  size = 20,
  color = "currentColor",
  className = "",
  style,
  filled = false,
}) => (
  <svg
    viewBox="0 0 24 24"
    width={size}
    height={size}
    fill={filled ? color : "none"}
    stroke={color}
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    style={{ display: "block", ...style }}>
    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
  </svg>
)

export default StarIcon
