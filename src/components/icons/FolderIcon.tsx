import React from "react"

interface IconProps {
  size?: number
  color?: string
  className?: string
  filled?: boolean
}

export const FolderIcon: React.FC<IconProps> = ({
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
    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
  </svg>
)

export default FolderIcon
