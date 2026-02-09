import React from "react"

interface IconProps {
  size?: number
  color?: string
  className?: string
  filled?: boolean
}

export const PinIcon: React.FC<IconProps> = ({
  size = 18,
  color = "currentColor",
  className = "",
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
    style={{ display: "block" }}>
    <line x1="12" y1="17" x2="12" y2="22" />
    <path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1v4.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V17z" />
  </svg>
)

export default PinIcon
