import React from "react"

interface IconProps {
  size?: number
  color?: string
  className?: string
}

export const QuoteIcon: React.FC<IconProps> = ({
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
    strokeWidth="1.5"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    style={{ display: "block" }}>
    <path
      d="M3 21c3-3 4-6 4-9 0-3.31-2.69-6-6-6v2c2.21 0 4 1.79 4 4h-2a2 2 0 0 0-2 2v3a2 2 0 0 0 2 2h2z"
      fill={color}
      stroke="none"
    />
    <path
      d="M15 21c3-3 4-6 4-9 0-3.31-2.69-6-6-6v2c2.21 0 4 1.79 4 4h-2a2 2 0 0 0-2 2v3a2 2 0 0 0 2 2h2z"
      fill={color}
      stroke="none"
    />
  </svg>
)

export const ReplyIcon: React.FC<IconProps> = ({
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
    strokeWidth="1.5"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    style={{ display: "block" }}>
    <polyline points="9 17 4 12 9 7" />
    <path d="M20 18v-2a4 4 0 0 0-4-4H4" />
  </svg>
)

export const ChainIcon: React.FC<IconProps> = ({
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
    strokeWidth="1.5"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    style={{ display: "block" }}>
    <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
    <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
  </svg>
)
