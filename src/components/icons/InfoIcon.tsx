/**
 * SVG 图标组件 - 信息提示（圆形 i）
 */
import React from "react"

interface IconProps {
  size?: number
  color?: string
  className?: string
  style?: React.CSSProperties
}

export const InfoIcon: React.FC<IconProps> = ({
  size = 20,
  color = "currentColor",
  className = "",
  style,
}) => (
  <svg
    viewBox="0 0 24 24"
    width={size}
    height={size}
    fill="none"
    stroke={color}
    strokeWidth={2}
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    style={{ display: "block", ...style }}>
    <circle cx={12} cy={12} r={10} />
    <line x1={12} y1={16} x2={12} y2={12} />
    <line x1={12} y1={8} x2={12.01} y2={8} />
  </svg>
)

export default InfoIcon
