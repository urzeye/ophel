import React from "react"

interface IconProps {
  size?: number
  color?: string
  className?: string
  style?: React.CSSProperties
}

export const NotificationIcon: React.FC<IconProps> = ({
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
    <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
    <path d="M13.73 21a2 2 0 0 1-3.46 0" />
  </svg>
)

export default NotificationIcon
