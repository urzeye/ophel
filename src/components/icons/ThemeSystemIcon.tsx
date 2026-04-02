/**
 * SVG 图标组件 - 跟随系统
 * 来源：Google Material Icons `brightness_4`
 */
import React from "react"

interface IconProps {
  size?: number
  color?: string
  className?: string
}

export const ThemeSystemIcon: React.FC<IconProps> = ({
  size = 18,
  color = "currentColor",
  className = "",
}) => (
  <svg
    viewBox="0 0 24 24"
    width={size}
    height={size}
    className={className}
    style={{ display: "block" }}>
    <path
      fill={color}
      fillRule="evenodd"
      clipRule="evenodd"
      d="M20 8.69V4h-4.69L12 .69 8.69 4H4v4.69L.69 12 4 15.31V20h4.69L12 23.31 15.31 20H20v-4.69L23.31 12 20 8.69zM12 18c-.89 0-1.74-.2-2.5-.55C11.56 16.5 13 14.42 13 12s-1.44-4.5-3.5-5.45C10.26 6.2 11.11 6 12 6c3.31 0 6 2.69 6 6s-2.69 6-6 6z"
    />
  </svg>
)

export default ThemeSystemIcon
