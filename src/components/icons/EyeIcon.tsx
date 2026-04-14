import React from "react"

interface IconProps {
  size?: number
  color?: string
  className?: string
}

export const EyeIcon: React.FC<IconProps> = ({
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
    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
    <circle cx="12" cy="12" r="3" />
  </svg>
)


export const EyeClosedIcon: React.FC<IconProps> = ({
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
    <path d="M2 12s3-4.5 10-4.5 10 4.5 10 4.5" />
    <path d="m3 15 2-2" />
    <path d="m21 15-2-2" />
    <path d="m8 17 1-2" />
    <path d="m16 17-1-2" />
    <path d="m12 18v-2" />
  </svg>
)

export default EyeIcon
