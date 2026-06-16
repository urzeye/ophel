/**
 * SVG 图标组件 - 会话 (气泡)
 * 风格：Outline (stroke-based)
 */
import React from "react"

interface IconProps {
  size?: number
  color?: string
  className?: string
}

export const ConversationIcon: React.FC<IconProps> = ({
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
    xmlns="http://www.w3.org/2000/svg"
    className={className}
    style={{ display: "block", flexShrink: 0 }}>
    <path d="M6.5 17.5H6a3.5 3.5 0 0 1-3.5-3.5V7a3.5 3.5 0 0 1 3.5-3.5h12A3.5 3.5 0 0 1 21.5 7v7a3.5 3.5 0 0 1-3.5 3.5h-5.2L6.5 20.5v-3Z" />
    <circle cx="8" cy="10.5" r="1" fill={color} stroke="none" />
    <circle cx="12" cy="10.5" r="1" fill={color} stroke="none" />
    <circle cx="16" cy="10.5" r="1" fill={color} stroke="none" />
  </svg>
)

export default ConversationIcon
