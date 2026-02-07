import React from "react"

interface IconProps {
  size?: number
  color?: string
  className?: string
}

export const CleanupIcon: React.FC<IconProps> = ({
  size = 18,
  color = "currentColor",
  className = "",
}) => {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}>
      {/* Bookmark Shape */}
      <path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z" />
      {/* X (Cross) inside - implying invalid or remove */}
      <path d="m14.5 9-5 5" />
      <path d="m9.5 9 5 5" />
    </svg>
  )
}

export default CleanupIcon
