import React from "react"

interface IconProps {
  size?: number
  color?: string
  className?: string
}

export const TimeIcon: React.FC<IconProps> = ({
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
    <circle cx="12" cy="12" r="10" />
    <polyline points="12 6 12 12 16 14" />
  </svg>
)

export default TimeIcon
