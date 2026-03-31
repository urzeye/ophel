import React from "react"

interface IconProps {
  size?: number
  color?: string
  className?: string
}

export const UserQueryIcon: React.FC<IconProps> = ({
  size = 15,
  color = "currentColor",
  className = "",
}) => (
  <svg
    viewBox="0 0 1024 1024"
    width={size}
    height={size}
    xmlns="http://www.w3.org/2000/svg"
    className={className}
    style={{ display: "block", flexShrink: 0 }}>
    <path
      d="M674.432 64c20.224 0 37.888 18.944 37.888 40.576v297.792h232.192c7.616 0 15.168 2.752 20.16 8.128a41.92 41.92 0 0 1 10.176 56.832l-295.36 473.728a34.688 34.688 0 0 1-30.272 18.944c-20.16 0-37.824-18.944-37.824-40.576V621.632h-232.32a27.584 27.584 0 0 1-20.16-8.128 41.92 41.92 0 0 1-10.048-56.832l295.296-473.728A34.688 34.688 0 0 1 674.432 64zM44.8 140.8h358.4a44.8 44.8 0 0 1 0 89.6H44.8a44.8 44.8 0 1 1 0-89.6z m0 640h358.4a44.8 44.8 0 0 1 0 89.6H44.8a44.8 44.8 0 0 1 0-89.6z m0-320h166.4a44.8 44.8 0 0 1 0 89.6H44.8a44.8 44.8 0 1 1 0-89.6z"
      fill={color}
    />
  </svg>
)

export default UserQueryIcon
