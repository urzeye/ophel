import React from "react"

interface IconProps {
  size?: number
  color?: string
  className?: string
  style?: React.CSSProperties
}

export const CopyOutlineIcon: React.FC<IconProps> = ({
  size = 18,
  color = "currentColor",
  className = "",
  style,
}) => (
  <svg
    viewBox="0 0 1024 1024"
    width={size}
    height={size}
    xmlns="http://www.w3.org/2000/svg"
    className={className}
    style={{ display: "block", flexShrink: 0, ...style }}>
    <path
      d="M308.623635 461.155909h406.75273v-355.90864a50.844091 50.844091 0 1 1 101.688183 0v813.505462a50.844091 50.844091 0 0 1-101.688183 0v-355.90864h-406.75273v355.90864a50.844091 50.844091 0 0 1-101.688183 0v-813.505462a50.844091 50.844091 0 0 1 101.688183 0z"
      fill={color}
    />
  </svg>
)

export default CopyOutlineIcon
