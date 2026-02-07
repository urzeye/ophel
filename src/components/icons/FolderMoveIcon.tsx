import React from "react"

interface IconProps {
  size?: number
  color?: string
  className?: string
}

export const FolderMoveIcon: React.FC<IconProps> = ({
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
      {/* Folder Outline */}
      <path d="M2 9V5a2 2 0 0 1 2-2h3.9a2 2 0 0 1 1.69.9l.81 1.2a2 2 0 0 0 1.67.9H20a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H2" />
      {/* Arrow Pointing In (Down) */}
      <path d="M12 10v6" />
      <path d="m9 13 3 3 3-3" />
    </svg>
  )
}

export default FolderMoveIcon
