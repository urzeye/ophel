import React from "react"

interface IconProps {
  size?: number
  color?: string
  className?: string
  style?: React.CSSProperties
}

export const CookieIcon: React.FC<IconProps> = ({
  size = 20,
  color = "currentColor",
  className = "",
  style,
}) => (
  <svg
    viewBox="0 0 24 24"
    width={size}
    height={size}
    className={className}
    style={{ display: "block", ...style }}
    fill="none"
    stroke={color}
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round">
    <path d="M12 2a10 10 0 1 0 10 10 4 4 0 0 1-5-5 4 4 0 0 1-5-5" />
    <path d="M8.5 8.5v.01" />
    <path d="M7.5 15.5v.01" />
    <path d="M12 12v.01" />
    <path d="M11 17v.01" />
    <path d="M16 16v.01" />
  </svg>
)

export default CookieIcon
