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
    viewBox="0 0 1024 1024"
    width={size}
    height={size}
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
    style={{ display: "block" }}>
    <path
      d="M198.4 922.496H512a44.8 44.8 0 1 1 0 89.6H198.4a89.6 89.6 0 0 1-89.6-89.6v-806.4a89.6 89.6 0 0 1 89.6-89.6h627.2a89.6 89.6 0 0 1 89.6 89.6v403.2a44.8 44.8 0 0 1-89.6 0v-403.2H198.4v806.4z"
      fill={color}
    />
    <path
      d="M769.6 986.496a41.6 41.6 0 0 0 41.6-41.6v-291.2a41.6 41.6 0 0 0-83.2 0v291.2c0 22.976 18.624 41.6 41.6 41.6z"
      fill={color}
    />
    <path
      d="M742.4 994.432a38.4 38.4 0 0 0 54.4 0l100.736-100.8a38.4 38.4 0 0 0-54.272-54.336l-73.664 73.6-73.6-73.6a38.4 38.4 0 0 0-49.024-4.48l-5.312 4.48a38.4 38.4 0 0 0 0 54.336l100.8 100.8zM691.2 295.296a44.8 44.8 0 1 1 0 89.6H332.8a44.8 44.8 0 0 1 0-89.6h358.4zM512 474.496a44.8 44.8 0 0 1 0 89.6H332.8a44.8 44.8 0 0 1 0-89.6H512z"
      fill={color}
    />
  </svg>
)

export default SegmentedExportIcon
