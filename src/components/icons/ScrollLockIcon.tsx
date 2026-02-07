import React from "react"

interface IconProps {
  size?: number
  color?: string
  className?: string
}

export const ScrollLockIcon: React.FC<IconProps> = ({
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
      {/* Down Arrow (representing auto-scroll) */}
      <path d="M12 3v12" />
      <path d="m8 11 4 4 4-4" />
      {/* Bottom Line */}
      <path d="M19 19H5" />
      {/* Forbidden/Stop Slash */}
      <circle cx="12" cy="11" r="9" strokeOpacity="0.3" />
      <path d="m4.9 4.9 14.2 14.2" />
    </svg>
  )
}

export default ScrollLockIcon
