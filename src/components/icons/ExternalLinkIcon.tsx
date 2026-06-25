import React from "react"

interface IconProps {
  size?: number
  color?: string
  className?: string
  style?: React.CSSProperties
}

export const ExternalLinkIcon: React.FC<IconProps> = ({
  size = 18,
  color = "currentColor",
  className = "",
  style,
}) => (
  <svg
    viewBox="0 0 24 24"
    width={size}
    height={size}
    fill="none"
    stroke={color}
    strokeWidth="1.5"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    style={{ display: "block", width: size, height: size, ...style }}>
    <path d="M15 3h6v6" />
    <path d="M10 14 21 3" />
    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
  </svg>
)

export default ExternalLinkIcon
