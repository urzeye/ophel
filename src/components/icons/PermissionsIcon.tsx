/**
 * SVG 图标组件 - 权限管理
 */
import React from "react"

interface IconProps {
  size?: number
  color?: string
  className?: string
  style?: React.CSSProperties
}

export const PermissionsIcon: React.FC<IconProps> = ({
  size = 20,
  color = "currentColor",
  className = "",
  style,
}) => (
  <svg
    viewBox="0 0 1024 1024"
    width={size}
    height={size}
    className={className}
    style={{ display: "block", ...style }}>
    <path
      d="M511.5 119.3l366.8 168.8c-0.4 14.7-1.6 35-4.5 60.2-5.9 52.4-20.6 137.5-56.7 245.4-23 68.8-86.3 145.9-183.1 222.9-48.8 38.9-95.1 68.8-122.2 85.3-26.6-16.9-71.8-47.1-119.7-86.2-95.6-78-159-155.6-183.5-224.5-38.5-108.6-53.1-192.1-58.5-243.1-2.6-24.8-3.4-44.5-3.5-58.7l364.9-170.1m-0.2-55.1L98 257s-16 126.8 63.6 351c67.6 190.3 349.8 352.3 349.8 352.3s289.2-159 353.2-350.6C938.3 388.8 928 256 928 256L511.3 64.2z"
      fill={color}
    />
    <path
      d="M511.3 273.3c25.4 0 46.1 20.7 46.1 46.1s-20.7 46.1-46.1 46.1c-25.4 0-46.1-20.7-46.1-46.1s20.7-46.1 46.1-46.1m0-50c-53.1 0-96.1 43-96.1 96.1s43 96.1 96.1 96.1 96.1-43 96.1-96.1-43-96.1-96.1-96.1z"
      fill={color}
    />
    <path d="M486.3 383.8h50v384h-50z" fill={color} />
    <path d="M513 599h94.5v50H513zM513 717h94.5v50H513z" fill={color} />
  </svg>
)

export default PermissionsIcon
