import React from "react"

interface IconProps {
  size?: number
  color?: string
  className?: string
}

export const CheckIcon: React.FC<IconProps> = ({
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
    <polyline points="20 6 9 17 4 12" />
  </svg>
)

export default CheckIcon
