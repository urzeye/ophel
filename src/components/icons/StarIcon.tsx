/**
 * SVG 图标组件 - 星星 (收藏/评分)
 * 风格：Fill-based (1024×1024 viewBox)
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
    viewBox="0 0 1024 1024"
    width={size}
    height={size}
    xmlns="http://www.w3.org/2000/svg"
    className={className}
    style={{ display: "block", flexShrink: 0, ...style }}>
    <polygon
      points="512,64 625,357 968,364 695,571 794,901 512,704 230,901 329,571 56,364 399,357"
      fill={filled ? color : "none"}
      stroke={color}
      strokeWidth={96}
      strokeLinejoin="round"
    />
  </svg>
)

export default StarIcon
