import React from "react"

interface IconProps {
  size?: number
  color?: string
  className?: string
}

export const SegmentedExportIcon: React.FC<IconProps> = ({
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
    strokeWidth="1.6"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    style={{ display: "block" }}>
    <rect x="4" y="4" width="10" height="4" rx="1.2" />
    <rect x="4" y="10" width="10" height="4" rx="1.2" />
    <rect x="4" y="16" width="10" height="4" rx="1.2" />
    <path d="M17 6h2.5a.5.5 0 0 1 .5.5V9" />
    <path d="M20 6l-4.5 4.5" />
    <path d="M17 12h3" />
    <path d="M17 18h3" />
  </svg>
)

export default SegmentedExportIcon
