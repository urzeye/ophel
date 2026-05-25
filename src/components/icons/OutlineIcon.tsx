/**
 * SVG 图标组件 - 大纲（层级结构）
 * 风格：Fill-based，1024×1024 viewBox
 */
import React from "react"

interface IconProps {
  size?: number
  color?: string
  className?: string
  style?: React.CSSProperties
}

export const OutlineIcon: React.FC<IconProps> = ({
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
      d="M192 192m32 0l0 0q32 0 32 32l0 640q0 32-32 32l0 0q-32 0-32-32l0-640q0-32 32-32Z"
      fill={color}
    />
    <path
      d="M192 832m32 0l256 0q32 0 32 32l0 0q0 32-32 32l-256 0q-32 0-32-32l0 0q0-32 32-32Z"
      fill={color}
    />
    <path
      d="M192 512m32 0l256 0q32 0 32 32l0 0q0 32-32 32l-256 0q-32 0-32-32l0 0q0-32 32-32Z"
      fill={color}
    />
    <path
      d="M448 192m64 0l320 0q64 0 64 64l0 0q0 64-64 64l-320 0q-64 0-64-64l0 0q0-64 64-64Z"
      fill={color}
    />
    <path
      d="M640 480m64 0l128 0q64 0 64 64l0 0q0 64-64 64l-128 0q-64 0-64-64l0 0q0-64 64-64Z"
      fill={color}
    />
    <path
      d="M640 768m64 0l128 0q64 0 64 64l0 0q0 64-64 64l-128 0q-64 0-64-64l0 0q0-64 64-64Z"
      fill={color}
    />
    <path d="M224 224m-96 0a96 96 0 1 0 192 0 96 96 0 1 0-192 0Z" fill={color} />
  </svg>
)

export default OutlineIcon
