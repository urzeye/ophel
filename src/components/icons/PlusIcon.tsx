import React from "react"

interface IconProps {
  size?: number
  color?: string
  className?: string
}

export const PlusIcon: React.FC<IconProps> = ({
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
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    style={{ display: "block" }}>
    <path d="M12 5v14" />
    <path d="M5 12h14" />
  </svg>
)

export default PlusIcon
